import type { Database } from "db";
import { stores, userRoles, users } from "db/schema";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type {
	Role,
	StoreUpdateInput,
	UserCreateInput,
	UserUpdateInput,
} from "shared";
import { isDatabaseError } from "./database-errors";

export class DuplicateUsernameRepoError extends Error {}
export class LastAdminRepoError extends Error {}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Active admins OTHER than `exceptUserId`. Used to protect the last admin from
// being demoted or deactivated, evaluated inside the mutating transaction so
// two concurrent demotions cannot both pass the check.
async function otherActiveAdminCount(
	tx: Tx,
	exceptUserId: string,
): Promise<number> {
	const [row] = await tx
		.select({ count: sql<number>`count(*)::int` })
		.from(userRoles)
		.innerJoin(users, eq(users.id, userRoles.userId))
		.where(
			and(
				eq(userRoles.role, "admin"),
				eq(users.active, true),
				ne(users.id, exceptUserId),
			),
		);
	return row?.count ?? 0;
}

type UserRow = {
	id: string;
	name: string;
	username: string;
	active: boolean;
	createdAt: Date;
	role: Role | null;
};

function userFromRows(rows: UserRow[]) {
	const first = rows[0];
	if (!first) {
		return undefined;
	}

	return {
		id: first.id,
		name: first.name,
		username: first.username,
		roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
		active: first.active,
		createdAt: first.createdAt,
	};
}

const userSelection = {
	id: users.id,
	name: users.name,
	username: users.username,
	active: users.active,
	createdAt: users.createdAt,
	role: userRoles.role,
};

const storeSelection = {
	id: stores.id,
	name: stores.name,
	currency: stores.currency,
	address: stores.address,
	velocityWindowDays: stores.velocityWindowDays,
	lowStockCoverDays: stores.lowStockCoverDays,
	createdAt: stores.createdAt,
};

export class AdministrationRepo {
	constructor(private readonly database: Database) {}

	async listUsers() {
		const rows = await this.database
			.select(userSelection)
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.orderBy(asc(users.name), asc(users.username), asc(userRoles.role));

		const grouped = new Map<string, UserRow[]>();
		for (const row of rows) {
			const group = grouped.get(row.id) ?? [];
			group.push(row);
			grouped.set(row.id, group);
		}

		return [...grouped.values()].flatMap((group) => {
			const user = userFromRows(group);
			return user ? [user] : [];
		});
	}

	async findUserById(id: string) {
		const rows = await this.database
			.select(userSelection)
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.where(eq(users.id, id))
			.orderBy(asc(userRoles.role));
		return userFromRows(rows);
	}

	async createUser(
		input: UserCreateInput & { passwordHash: string },
	): Promise<string> {
		try {
			return await this.database.transaction(async (transaction) => {
				const [user] = await transaction
					.insert(users)
					.values({
						name: input.name,
						username: input.username,
						passwordHash: input.passwordHash,
					})
					.returning({ id: users.id });

				if (!user) {
					throw new Error("Failed to create user.");
				}

				await transaction.insert(userRoles).values(
					input.roles.map((role) => ({
						userId: user.id,
						role,
					})),
				);
				return user.id;
			});
		} catch (error) {
			if (isDatabaseError(error, "23505", "users_username_unique")) {
				throw new DuplicateUsernameRepoError();
			}
			throw error;
		}
	}

	async updateUser(id: string, input: UserUpdateInput): Promise<boolean> {
		return this.database.transaction(async (transaction) => {
			const [existing] = await transaction
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, id));
			if (!existing) {
				return false;
			}

			if (input.name !== undefined) {
				await transaction
					.update(users)
					.set({ name: input.name })
					.where(eq(users.id, id));
			}

			if (input.roles !== undefined) {
				// Removing admin from this user is only allowed if another active
				// admin remains, so store.configure never becomes unreachable.
				if (
					!input.roles.includes("admin") &&
					(await otherActiveAdminCount(transaction, id)) === 0
				) {
					throw new LastAdminRepoError();
				}
				await transaction.delete(userRoles).where(eq(userRoles.userId, id));
				await transaction.insert(userRoles).values(
					input.roles.map((role) => ({
						userId: id,
						role,
					})),
				);
			}

			return true;
		});
	}

	async setUserActive(id: string, active: boolean): Promise<boolean> {
		return this.database.transaction(async (transaction) => {
			const [existing] = await transaction
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, id));
			if (!existing) {
				return false;
			}

			if (!active && (await otherActiveAdminCount(transaction, id)) === 0) {
				// Deactivating this user would leave no active admin.
				const [isAdmin] = await transaction
					.select({ role: userRoles.role })
					.from(userRoles)
					.where(and(eq(userRoles.userId, id), eq(userRoles.role, "admin")));
				if (isAdmin) {
					throw new LastAdminRepoError();
				}
			}

			await transaction.update(users).set({ active }).where(eq(users.id, id));
			return true;
		});
	}

	async getStore() {
		const [store] = await this.database
			.select(storeSelection)
			.from(stores)
			.limit(1);
		return store;
	}

	async updateStore(input: StoreUpdateInput) {
		const [current] = await this.database
			.select({ id: stores.id })
			.from(stores)
			.limit(1);
		if (!current) {
			return undefined;
		}

		const [store] = await this.database
			.update(stores)
			.set(input)
			.where(eq(stores.id, current.id))
			.returning(storeSelection);
		return store;
	}
}
