import type { Database } from "db";
import { sessions, userRoles, users } from "db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "shared";

export type IdentityRecord = {
	id: string;
	name: string;
	username: string;
	passwordHash: string;
	active: boolean;
	roles: Role[];
};

export type SessionIdentityRecord = IdentityRecord & {
	sessionId: string;
	expiresAt: Date;
};

type IdentityRow = {
	id: string;
	name: string;
	username: string;
	passwordHash: string;
	active: boolean;
	role: Role | null;
};

function identityFromRows(rows: IdentityRow[]): IdentityRecord | undefined {
	const first = rows[0];
	if (!first) {
		return undefined;
	}

	return {
		id: first.id,
		name: first.name,
		username: first.username,
		passwordHash: first.passwordHash,
		active: first.active,
		roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
	};
}

export class IdentityRepo {
	constructor(private readonly database: Database) {}

	async findByUsername(username: string): Promise<IdentityRecord | undefined> {
		const rows = await this.database
			.select({
				id: users.id,
				name: users.name,
				username: users.username,
				passwordHash: users.passwordHash,
				active: users.active,
				role: userRoles.role,
			})
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.where(eq(users.username, username));

		return identityFromRows(rows);
	}

	async createSession(userId: string, tokenHash: string, expiresAt: Date) {
		const [session] = await this.database
			.insert(sessions)
			.values({ userId, tokenHash, expiresAt })
			.returning({ id: sessions.id });

		if (!session) {
			throw new Error("Failed to create session.");
		}

		return session;
	}

	async findBySessionHash(
		tokenHash: string,
	): Promise<SessionIdentityRecord | undefined> {
		const rows = await this.database
			.select({
				sessionId: sessions.id,
				expiresAt: sessions.expiresAt,
				id: users.id,
				name: users.name,
				username: users.username,
				passwordHash: users.passwordHash,
				active: users.active,
				role: userRoles.role,
			})
			.from(sessions)
			.innerJoin(users, eq(sessions.userId, users.id))
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.where(eq(sessions.tokenHash, tokenHash));

		const identity = identityFromRows(rows);
		const first = rows[0];
		if (!identity || !first) {
			return undefined;
		}

		return {
			...identity,
			sessionId: first.sessionId,
			expiresAt: first.expiresAt,
		};
	}

	async deleteSessionByHash(tokenHash: string) {
		await this.database
			.delete(sessions)
			.where(eq(sessions.tokenHash, tokenHash));
	}

	async deleteSessionById(sessionId: string) {
		await this.database.delete(sessions).where(eq(sessions.id, sessionId));
	}
}
