import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { client, createDb } from "db";
import { sessions, stores, userRoles, users } from "db/schema";
import { migrateDatabase, truncateDatabase } from "db/testing";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
	PERMISSIONS,
	type Permission,
	ROLE_PERMISSIONS,
	ROLES,
	type Role,
} from "shared";
import { createApp } from "../src/app";
import type { AppEnv } from "../src/auth-context";
import { auth } from "../src/middleware/auth";
import { rbac } from "../src/middleware/rbac";
import { SESSION_COOKIE_NAME } from "../src/middleware/session-cookie";
import { IdentityRepo } from "../src/repos/identity-repo";
import { AuthService } from "../src/services/auth-service";
import {
	createSessionMaterial,
	hashSessionToken,
} from "../src/services/session";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for server integration tests. See app/.env.example.",
	);
}

const testClient = client(testDatabaseUrl);
const testDb = createDb(testClient);
const app = createApp(testDb);
let fixturePasswordHash = "";

type CreatedUser = {
	id: string;
	name: string;
	username: string;
	roles: Role[];
};

type ErrorBody = {
	code: string;
	message: string;
};

const setupBody = {
	storeName: "ShelfLife Test Store",
	currency: "usd",
	address: "1 Test Avenue",
	admin: {
		name: "Setup Admin",
		username: "setup.admin",
		password: "password123",
	},
};

beforeAll(async () => {
	await migrateDatabase(testDb);
	fixturePasswordHash = await Bun.password.hash("password123", {
		algorithm: "argon2id",
	});
});

beforeEach(async () => {
	await truncateDatabase(testClient);
});

afterAll(async () => {
	await testClient.end();
});

async function createUser(options: {
	username: string;
	roles: Role[];
	active?: boolean;
}): Promise<CreatedUser> {
	const name = `Test ${options.username}`;
	const [user] = await testDb
		.insert(users)
		.values({
			name,
			username: options.username,
			passwordHash: fixturePasswordHash,
			active: options.active ?? true,
		})
		.returning({ id: users.id });

	if (!user) {
		throw new Error("Failed to create test user.");
	}

	if (options.roles.length > 0) {
		await testDb.insert(userRoles).values(
			options.roles.map((role) => ({
				userId: user.id,
				role,
			})),
		);
	}

	return {
		id: user.id,
		name,
		username: options.username,
		roles: options.roles,
	};
}

async function createSessionCookie(
	userId: string,
	expiresAt?: Date,
): Promise<{ cookie: string; sessionId: string }> {
	const material = createSessionMaterial();
	const [session] = await testDb
		.insert(sessions)
		.values({
			userId,
			tokenHash: material.tokenHash,
			expiresAt: expiresAt ?? material.expiresAt,
		})
		.returning({ id: sessions.id });

	if (!session) {
		throw new Error("Failed to create test session.");
	}

	return {
		cookie: `${SESSION_COOKIE_NAME}=${material.token}`,
		sessionId: session.id,
	};
}

function getResponseCookie(response: Response): string {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie) {
		throw new Error("Response did not set a session cookie.");
	}

	const [cookie] = setCookie.split(";");
	if (!cookie) {
		throw new Error("Response session cookie was malformed.");
	}
	return cookie;
}

async function postJson(path: string, body: unknown, cookie?: string) {
	const headers = new Headers({ "content-type": "application/json" });
	if (cookie) {
		headers.set("cookie", cookie);
	}

	return app.request(path, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

function createProtectedApp(permission: Permission) {
	const authService = new AuthService(new IdentityRepo(testDb));
	return new Hono<AppEnv>().get(
		"/protected",
		auth(authService),
		rbac(permission),
		(context) => context.json({ allowed: true }),
	);
}

describe("session authentication", () => {
	test("login, me, and logout form a complete session lifecycle", async () => {
		const user = await createUser({ username: "admin", roles: ["admin"] });

		const loginResponse = await postJson("/api/auth/login", {
			username: user.username,
			password: "password123",
		});
		expect(loginResponse.status).toBe(200);
		const cookie = getResponseCookie(loginResponse);
		expect(loginResponse.headers.get("set-cookie")).toContain("HttpOnly");
		expect(loginResponse.headers.get("set-cookie")).toContain("SameSite=Lax");
		expect(loginResponse.headers.get("set-cookie")).toContain("Path=/");

		const meResponse = await app.request("/api/auth/me", {
			headers: { cookie },
		});
		expect(meResponse.status).toBe(200);
		expect(await meResponse.json()).toEqual({
			id: user.id,
			name: user.name,
			username: user.username,
			roles: ["admin"],
		});

		const logoutResponse = await postJson("/api/auth/logout", {}, cookie);
		expect(logoutResponse.status).toBe(200);

		const afterLogout = await app.request("/api/auth/me", {
			headers: { cookie },
		});
		expect(afterLogout.status).toBe(401);
		expect((await afterLogout.json()) as ErrorBody).toMatchObject({
			code: "UNAUTHENTICATED",
		});
	});

	test("expired sessions return 401 and are deleted lazily", async () => {
		const user = await createUser({ username: "expired", roles: ["manager"] });
		const expired = await createSessionCookie(
			user.id,
			new Date(Date.now() - 1_000),
		);

		const response = await app.request("/api/auth/me", {
			headers: { cookie: expired.cookie },
		});
		expect(response.status).toBe(401);

		const [remaining] = await testDb
			.select({ value: count() })
			.from(sessions)
			.where(eq(sessions.id, expired.sessionId));
		expect(remaining?.value).toBe(0);
	});

	test("deactivated users cannot log in or use an existing session", async () => {
		const user = await createUser({
			username: "deactivated",
			roles: ["admin"],
			active: false,
		});

		const loginResponse = await postJson("/api/auth/login", {
			username: user.username,
			password: "password123",
		});
		expect(loginResponse.status).toBe(401);

		const existing = await createSessionCookie(user.id);
		const meResponse = await app.request("/api/auth/me", {
			headers: { cookie: existing.cookie },
		});
		expect(meResponse.status).toBe(401);
	});

	test("wrong usernames and wrong passwords return identical errors", async () => {
		await createUser({ username: "known.user", roles: ["sales_clerk"] });

		const wrongUsername = await postJson("/api/auth/login", {
			username: "missing.user",
			password: "password123",
		});
		const wrongPassword = await postJson("/api/auth/login", {
			username: "known.user",
			password: "wrong-password",
		});

		expect(wrongUsername.status).toBe(401);
		expect(wrongPassword.status).toBe(401);
		expect(await wrongUsername.json()).toEqual(await wrongPassword.json());
	});

	test("invalid request bodies use the validation error envelope", async () => {
		const response = await postJson("/api/auth/login", {
			username: "",
			password: "",
		});
		expect(response.status).toBe(400);
		expect((await response.json()) as ErrorBody).toMatchObject({
			code: "VALIDATION",
			message: "Request validation failed.",
		});
	});
});

describe("first-run setup", () => {
	test("creates the store, admin, role, and logged-in session atomically", async () => {
		const initialStatus = await app.request("/api/setup/status");
		expect(initialStatus.status).toBe(200);
		expect(await initialStatus.json()).toEqual({ needed: true });

		const response = await postJson("/api/setup", setupBody);
		expect(response.status).toBe(201);
		const cookie = getResponseCookie(response);

		const [storeCount] = await testDb.select({ value: count() }).from(stores);
		const [userCount] = await testDb.select({ value: count() }).from(users);
		const [roleCount] = await testDb.select({ value: count() }).from(userRoles);
		const [sessionCount] = await testDb
			.select({ value: count() })
			.from(sessions);
		expect(storeCount?.value).toBe(1);
		expect(userCount?.value).toBe(1);
		expect(roleCount?.value).toBe(1);
		expect(sessionCount?.value).toBe(1);

		const [admin] = await testDb
			.select({ passwordHash: users.passwordHash })
			.from(users);
		expect(admin?.passwordHash.startsWith("$argon2id$")).toBe(true);
		expect(
			admin
				? await Bun.password.verify("password123", admin.passwordHash)
				: false,
		).toBe(true);

		const meResponse = await app.request("/api/auth/me", {
			headers: { cookie },
		});
		expect(meResponse.status).toBe(200);
		expect(await meResponse.json()).toMatchObject({
			username: setupBody.admin.username,
			roles: ["admin"],
		});

		const completedStatus = await app.request("/api/setup/status");
		expect(await completedStatus.json()).toEqual({ needed: false });

		const secondSetup = await postJson("/api/setup", setupBody);
		expect(secondSetup.status).toBe(403);
		expect((await secondSetup.json()) as ErrorBody).toMatchObject({
			code: "SETUP_ALREADY_COMPLETE",
		});
	});

	test("two simultaneous setup calls allow exactly one success", async () => {
		const [first, second] = await Promise.all([
			postJson("/api/setup", {
				...setupBody,
				storeName: "First Store",
				admin: { ...setupBody.admin, username: "first.admin" },
			}),
			postJson("/api/setup", {
				...setupBody,
				storeName: "Second Store",
				admin: { ...setupBody.admin, username: "second.admin" },
			}),
		]);

		expect([first.status, second.status].sort()).toEqual([201, 403]);

		const failed = first.status === 403 ? first : second;
		expect((await failed.json()) as ErrorBody).toMatchObject({
			code: "SETUP_ALREADY_COMPLETE",
		});

		const [storeCount] = await testDb.select({ value: count() }).from(stores);
		const [userCount] = await testDb.select({ value: count() }).from(users);
		const [sessionCount] = await testDb
			.select({ value: count() })
			.from(sessions);
		expect(storeCount?.value).toBe(1);
		expect(userCount?.value).toBe(1);
		expect(sessionCount?.value).toBe(1);
	});
});

describe("role-based authorization", () => {
	for (const permission of Object.values(PERMISSIONS)) {
		test(`${permission} follows ROLE_PERMISSIONS for every role`, async () => {
			const protectedApp = createProtectedApp(permission);
			let allowedCount = 0;
			let deniedCount = 0;

			for (const role of ROLES) {
				const user = await createUser({
					username: `${permission}.${role}`,
					roles: [role],
				});
				const { cookie } = await createSessionCookie(user.id);
				const response = await protectedApp.request("/protected", {
					headers: { cookie },
				});
				const grants: readonly Permission[] = ROLE_PERMISSIONS[role];
				const expectedAllowed = grants.includes(permission);

				if (expectedAllowed) {
					allowedCount += 1;
					expect(response.status).toBe(200);
				} else {
					deniedCount += 1;
					expect(response.status).toBe(403);
					expect((await response.json()) as ErrorBody).toMatchObject({
						code: "FORBIDDEN",
					});
				}
			}

			expect(allowedCount).toBeGreaterThan(0);
			expect(deniedCount).toBeGreaterThan(0);
		});
	}

	test("a multi-role user receives both clerk permission sets", async () => {
		const user = await createUser({
			username: "multi.clerk",
			roles: ["sales_clerk", "inventory_clerk"],
		});
		const { cookie } = await createSessionCookie(user.id);

		for (const permission of [
			PERMISSIONS.SALES_RECORD,
			PERMISSIONS.PRODUCTS_CREATE_PUBLISH,
		] as const) {
			const response = await createProtectedApp(permission).request(
				"/protected",
				{
					headers: { cookie },
				},
			);
			expect(response.status).toBe(200);
		}
	});

	test("stored session tokens are SHA-256 hashes, never raw tokens", async () => {
		const user = await createUser({
			username: "token.check",
			roles: ["admin"],
		});
		const material = createSessionMaterial();
		await testDb.insert(sessions).values({
			userId: user.id,
			tokenHash: material.tokenHash,
			expiresAt: material.expiresAt,
		});

		expect(material.token).not.toBe(material.tokenHash);
		expect(material.tokenHash).toBe(hashSessionToken(material.token));
		expect(material.tokenHash).toMatch(/^[a-f0-9]{64}$/);
	});
});
