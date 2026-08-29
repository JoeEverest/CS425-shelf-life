import { sql } from "drizzle-orm";
import {
	check,
	date,
	numeric,
	pgEnum,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { users } from "./users";

export const expenseCategoryEnum = pgEnum("expense_category", [
	"rent",
	"transport",
	"delivery",
	"salaries",
	"utilities",
]);

export const expenses = pgTable(
	"expenses",
	{
		id: id(),
		category: expenseCategoryEnum("category").notNull(),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		incurredOn: date("incurred_on").notNull(),
		note: text("note"),
		recordedBy: uuid("recorded_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [check("expenses_amount_positive", sql`${table.amount} > 0`)],
);
