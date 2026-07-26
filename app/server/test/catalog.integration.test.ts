import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { client, createDb } from "db";
import {
	sessions,
	stockLevels,
	stockMovements,
	userRoles,
	users,
} from "db/schema";
import { migrateDatabase, truncateDatabase } from "db/testing";
import { count, eq, sql } from "drizzle-orm";
import type { ProductCreateInput, Role } from "shared";
import { createApp } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/middleware/session-cookie";
import { createSessionMaterial } from "../src/services/session";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for server integration tests. See app/.env.example.",
	);
}

const testClient = client(testDatabaseUrl);
const testDb = createDb(testClient);
const app = createApp(testDb);
let productSequence = 0;

type ErrorBody = {
	code: string;
	message: string;
};

type CategoryBody = {
	id: string;
	name: string;
};

type ProductBody = {
	id: string;
	sku: string;
	name: string;
	price: string | null;
	published: boolean;
	archived: boolean;
	qtyUnits: number;
};

beforeAll(async () => {
	await migrateDatabase(testDb);
});

beforeEach(async () => {
	await truncateDatabase(testClient);
	productSequence = 0;
});

afterAll(async () => {
	await testClient.end();
});

async function createUser(username: string, role: Role) {
	const [user] = await testDb
		.insert(users)
		.values({
			name: `Test ${username}`,
			username,
			passwordHash: "not-used-by-session-tests",
		})
		.returning({ id: users.id });

	if (!user) {
		throw new Error("Failed to create test user.");
	}

	await testDb.insert(userRoles).values({ userId: user.id, role });
	return user;
}

async function createSessionCookie(userId: string) {
	const material = createSessionMaterial();
	await testDb.insert(sessions).values({
		userId,
		tokenHash: material.tokenHash,
		expiresAt: material.expiresAt,
	});
	return `${SESSION_COOKIE_NAME}=${material.token}`;
}

async function request(
	method: string,
	path: string,
	cookie: string,
	body?: unknown,
) {
	const headers = new Headers({ cookie });
	const init: RequestInit = { method, headers };
	if (body !== undefined) {
		headers.set("content-type", "application/json");
		init.body = JSON.stringify(body);
	}
	return app.request(path, init);
}

async function createCategory(cookie: string, name = "Food") {
	const response = await request("POST", "/api/categories", cookie, { name });
	expect(response.status).toBe(201);
	return (await response.json()) as CategoryBody;
}

function productInput(
	categoryId: string,
	overrides: Partial<ProductCreateInput> = {},
): ProductCreateInput {
	productSequence += 1;
	return {
		sku: `SKU-${productSequence}`,
		name: `Product ${productSequence}`,
		categoryId,
		bulkUnitName: "case",
		unitsPerBulk: 12,
		saleUnitName: "unit",
		bulkCost: "24.00",
		...overrides,
	};
}

async function createProduct(
	cookie: string,
	categoryId: string,
	overrides: Partial<ProductCreateInput> = {},
) {
	const response = await request(
		"POST",
		"/api/products",
		cookie,
		productInput(categoryId, overrides),
	);
	expect(response.status).toBe(201);
	return (await response.json()) as ProductBody;
}

describe("categories and products", () => {
	test("duplicate category names return the stable conflict code", async () => {
		const manager = await createUser("category.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		await createCategory(cookie, "Household");

		const duplicate = await request("POST", "/api/categories", cookie, {
			name: "Household",
		});
		expect(duplicate.status).toBe(409);
		expect((await duplicate.json()) as ErrorBody).toMatchObject({
			code: "DUPLICATE_CATEGORY",
		});
	});

	test("price is rejected at product creation for every role (BR-PriceControl)", async () => {
		const clerk = await createUser("pricing.clerk", "inventory_clerk");
		const manager = await createUser("pricing.manager", "manager");
		const category = await createCategory(
			await createSessionCookie(manager.id),
			"Priced",
		);

		for (const actor of [clerk, manager]) {
			const cookie = await createSessionCookie(actor.id);
			const response = await request("POST", "/api/products", cookie, {
				...productInput(category.id),
				price: "9999.00",
			});
			expect(response.status).toBe(400);
			expect((await response.json()) as ErrorBody).toMatchObject({
				code: "VALIDATION",
			});
		}

		const created = await createProduct(
			await createSessionCookie(clerk.id),
			category.id,
		);
		expect(created.price).toBeNull();
	});

	test("an archived draft cannot be published", async () => {
		const manager = await createUser("archive.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		const category = await createCategory(cookie, "Archived");
		const product = await createProduct(cookie, category.id);

		const archive = await request(
			"POST",
			`/api/products/${product.id}/archive`,
			cookie,
		);
		expect(archive.status).toBe(200);

		const publish = await request(
			"POST",
			`/api/products/${product.id}/publish`,
			cookie,
		);
		expect(publish.status).toBe(409);
		expect((await publish.json()) as ErrorBody).toMatchObject({
			code: "PRODUCT_ARCHIVED",
		});
	});

	test("duplicate SKU conflicts and invalid unit breakdowns are rejected", async () => {
		const manager = await createUser("product.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		const category = await createCategory(cookie);
		const original = productInput(category.id, { sku: "DUPLICATE" });

		const created = await request("POST", "/api/products", cookie, original);
		expect(created.status).toBe(201);

		const duplicate = await request("POST", "/api/products", cookie, {
			...original,
			name: "Another product",
		});
		expect(duplicate.status).toBe(409);
		expect((await duplicate.json()) as ErrorBody).toMatchObject({
			code: "DUPLICATE_SKU",
		});

		for (const unitsPerBulk of [0, -1, 1.5]) {
			const invalid = await request(
				"POST",
				"/api/products",
				cookie,
				productInput(category.id, { unitsPerBulk }),
			);
			expect(invalid.status).toBe(400);
			expect((await invalid.json()) as ErrorBody).toMatchObject({
				code: "VALIDATION",
			});
		}
	});

	test("clerk publishes a draft, manager alone edits it, and archive filters it", async () => {
		const clerk = await createUser("inventory.clerk", "inventory_clerk");
		const manager = await createUser("lifecycle.manager", "manager");
		const clerkCookie = await createSessionCookie(clerk.id);
		const managerCookie = await createSessionCookie(manager.id);
		const category = await createCategory(managerCookie, "Stationery");
		const product = await createProduct(clerkCookie, category.id);

		expect(product.published).toBe(false);
		expect(product.qtyUnits).toBe(0);

		const publish = await request(
			"POST",
			`/api/products/${product.id}/publish`,
			clerkCookie,
		);
		expect(publish.status).toBe(200);

		const publishAgain = await request(
			"POST",
			`/api/products/${product.id}/publish`,
			clerkCookie,
		);
		expect(publishAgain.status).toBe(409);
		expect((await publishAgain.json()) as ErrorBody).toMatchObject({
			code: "ALREADY_PUBLISHED",
		});

		const clerkEdit = await request(
			"PATCH",
			`/api/products/${product.id}`,
			clerkCookie,
			{ name: "Clerk edit" },
		);
		expect(clerkEdit.status).toBe(403);

		const managerEdit = await request(
			"PATCH",
			`/api/products/${product.id}`,
			managerCookie,
			{ name: "Manager edit" },
		);
		expect(managerEdit.status).toBe(200);
		expect((await managerEdit.json()) as ProductBody).toMatchObject({
			name: "Manager edit",
		});

		const priceEdit = await request(
			"PATCH",
			`/api/products/${product.id}`,
			managerCookie,
			{ price: "4.00" },
		);
		expect(priceEdit.status).toBe(400);

		const archive = await request(
			"POST",
			`/api/products/${product.id}/archive`,
			managerCookie,
		);
		expect(archive.status).toBe(200);

		const defaultProducts = await request(
			"GET",
			"/api/products",
			managerCookie,
		);
		expect(defaultProducts.status).toBe(200);
		expect((await defaultProducts.json()) as ProductBody[]).toHaveLength(0);

		const allProducts = await request(
			"GET",
			"/api/products?archived=true",
			managerCookie,
		);
		expect(allProducts.status).toBe(200);
		expect((await allProducts.json()) as ProductBody[]).toEqual([
			expect.objectContaining({ id: product.id, archived: true }),
		]);

		const defaultStock = await request("GET", "/api/stock", managerCookie);
		expect((await defaultStock.json()) as unknown[]).toHaveLength(0);
		const allStock = await request(
			"GET",
			"/api/stock?archived=true",
			managerCookie,
		);
		expect((await allStock.json()) as Array<{ productId: string }>).toEqual([
			expect.objectContaining({ productId: product.id }),
		]);
	});

	test("a referenced category stays protected after its product is archived", async () => {
		const manager = await createUser("archive.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		const category = await createCategory(cookie, "Protected");
		const product = await createProduct(cookie, category.id);

		const beforeArchive = await request(
			"DELETE",
			`/api/categories/${category.id}`,
			cookie,
		);
		expect(beforeArchive.status).toBe(409);
		expect((await beforeArchive.json()) as ErrorBody).toMatchObject({
			code: "CATEGORY_IN_USE",
		});

		await request("POST", `/api/products/${product.id}/archive`, cookie);
		const afterArchive = await request(
			"DELETE",
			`/api/categories/${category.id}`,
			cookie,
		);
		expect(afterArchive.status).toBe(409);
		expect((await afterArchive.json()) as ErrorBody).toMatchObject({
			code: "CATEGORY_IN_USE",
		});
	});
});

describe("inventory ledger", () => {
	test("a sequence of adjustments keeps stock equal to movement deltas", async () => {
		const manager = await createUser("ledger.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		const category = await createCategory(cookie, "Ledger");
		const product = await createProduct(cookie, category.id);

		for (const [deltaUnits, note] of [
			[10, "Opening count"],
			[-3, "Damaged items"],
			[5, "Count correction"],
		] as const) {
			const response = await request("POST", "/api/stock/adjustments", cookie, {
				productId: product.id,
				deltaUnits,
				note,
			});
			expect(response.status).toBe(201);
		}

		const [level] = await testDb
			.select({ qtyUnits: stockLevels.qtyUnits })
			.from(stockLevels)
			.where(eq(stockLevels.productId, product.id));
		const [movementTotal] = await testDb
			.select({
				total: sql<number>`coalesce(sum(${stockMovements.deltaUnits}), 0)::int`,
			})
			.from(stockMovements)
			.where(eq(stockMovements.productId, product.id));

		expect(level?.qtyUnits).toBe(12);
		expect(Number(movementTotal?.total)).toBe(12);
		expect(level?.qtyUnits).toBe(Number(movementTotal?.total));

		const movements = await request(
			"GET",
			`/api/stock/movements?productId=${product.id}`,
			cookie,
		);
		expect(movements.status).toBe(200);
		expect((await movements.json()) as unknown[]).toHaveLength(3);
	});

	test("an excessive negative adjustment rolls back without a movement", async () => {
		const manager = await createUser("rollback.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		const category = await createCategory(cookie, "Rollback");
		const product = await createProduct(cookie, category.id);

		await request("POST", "/api/stock/adjustments", cookie, {
			productId: product.id,
			deltaUnits: 5,
			note: "Opening count",
		});
		const rejected = await request("POST", "/api/stock/adjustments", cookie, {
			productId: product.id,
			deltaUnits: -6,
			note: "Impossible correction",
		});
		expect(rejected.status).toBe(409);
		expect((await rejected.json()) as ErrorBody).toMatchObject({
			code: "INSUFFICIENT_STOCK",
		});

		const [level] = await testDb
			.select({ qtyUnits: stockLevels.qtyUnits })
			.from(stockLevels)
			.where(eq(stockLevels.productId, product.id));
		const [movementCount] = await testDb
			.select({ value: count() })
			.from(stockMovements)
			.where(eq(stockMovements.productId, product.id));
		expect(level?.qtyUnits).toBe(5);
		expect(movementCount?.value).toBe(1);
	});

	test("adjustment deltas beyond the sane bound are rejected", async () => {
		const manager = await createUser("bounds.manager", "manager");
		const cookie = await createSessionCookie(manager.id);
		const category = await createCategory(cookie, "Bounds");
		const product = await createProduct(cookie, category.id);

		const tooLarge = await request("POST", "/api/stock/adjustments", cookie, {
			productId: product.id,
			deltaUnits: 1_000_001,
			note: "overflow attempt",
		});
		expect(tooLarge.status).toBe(400);
		expect((await tooLarge.json()) as ErrorBody).toMatchObject({
			code: "VALIDATION",
		});
	});

	test("adjustment note validation and sales-clerk RBAC are enforced", async () => {
		const manager = await createUser("stock.manager", "manager");
		const salesClerk = await createUser("stock.sales", "sales_clerk");
		const managerCookie = await createSessionCookie(manager.id);
		const salesCookie = await createSessionCookie(salesClerk.id);
		const category = await createCategory(managerCookie, "RBAC");
		const product = await createProduct(managerCookie, category.id);

		const missingNote = await request(
			"POST",
			"/api/stock/adjustments",
			managerCookie,
			{ productId: product.id, deltaUnits: 1 },
		);
		expect(missingNote.status).toBe(400);
		expect((await missingNote.json()) as ErrorBody).toMatchObject({
			code: "VALIDATION",
		});

		const stock = await request("GET", "/api/stock", salesCookie);
		expect(stock.status).toBe(200);

		const forbidden = await request(
			"POST",
			"/api/stock/adjustments",
			salesCookie,
			{ productId: product.id, deltaUnits: 1, note: "Count correction" },
		);
		expect(forbidden.status).toBe(403);
		expect((await forbidden.json()) as ErrorBody).toMatchObject({
			code: "FORBIDDEN",
		});
	});
});
