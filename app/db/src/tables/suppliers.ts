import { boolean, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";

export const suppliers = pgTable("suppliers", {
	id: id(),
	name: text("name").notNull(),
	phone: text("phone"),
	note: text("note"),
	outstandingBalance: numeric("outstanding_balance", {
		precision: 12,
		scale: 2,
	})
		.default("0")
		.notNull(),
	archived: boolean("archived").default(false).notNull(),
	createdAt: createdAt(),
});
