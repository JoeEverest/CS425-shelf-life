import type { Database } from "db";
import { sessions, stores, userRoles, users } from "db/schema";
import { count } from "drizzle-orm";

export type BootstrapData = {
	store: {
		name: string;
		currency: string;
		address: string;
	};
	admin: {
		name: string;
		username: string;
		passwordHash: string;
	};
	session: {
		tokenHash: string;
		expiresAt: Date;
	};
};

export type BootstrapResult = {
	userId: string;
	sessionId: string;
};

export class SetupRepo {
	constructor(private readonly database: Database) {}

	async hasUsers(): Promise<boolean> {
		const [result] = await this.database.select({ value: count() }).from(users);
		return (result?.value ?? 0) > 0;
	}

	async bootstrap(data: BootstrapData): Promise<BootstrapResult | undefined> {
		return this.database.transaction(
			async (transaction) => {
				const [existingUser] = await transaction
					.select({ id: users.id })
					.from(users)
					.limit(1);

				if (existingUser) {
					return undefined;
				}

				await transaction.insert(stores).values(data.store);

				const [admin] = await transaction
					.insert(users)
					.values(data.admin)
					.returning({ id: users.id });

				if (!admin) {
					throw new Error("Failed to create setup administrator.");
				}

				await transaction
					.insert(userRoles)
					.values({ userId: admin.id, role: "admin" });

				const [session] = await transaction
					.insert(sessions)
					.values({ userId: admin.id, ...data.session })
					.returning({ id: sessions.id });

				if (!session) {
					throw new Error("Failed to create setup session.");
				}

				return { userId: admin.id, sessionId: session.id };
			},
			// Serializable predicate locking makes the users-empty check safe when two
			// first-run requests arrive together: PostgreSQL aborts one transaction.
			{ isolationLevel: "serializable" },
		);
	}
}
