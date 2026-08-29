import { numeric, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";

export const customers = pgTable("customers", {
	id: id(),
	name: text("name").notNull(),
	phone: text("phone"),
	outstandingBalance: numeric("outstanding_balance", {
		precision: 12,
		scale: 2,
	})
		.default("0")
		.notNull(),
	createdAt: createdAt(),
});
