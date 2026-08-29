import { pgEnum, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { users } from "./users";

export const roleEnum = pgEnum("role", [
	"admin",
	"manager",
	"sales_clerk",
	"inventory_clerk",
	"accountant",
]);

export const userRoles = pgTable(
	"user_roles",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		role: roleEnum("role").notNull(),
		createdAt: createdAt(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.role] })],
);
