import { numeric, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { users } from "./users";

export const saleTypeEnum = pgEnum("sale_type", ["cash", "credit"]);

export const sales = pgTable("sales", {
	id: id(),
	clerkId: uuid("clerk_id")
		.notNull()
		.references(() => users.id),
	soldAt: timestamp("sold_at", { withTimezone: true }).defaultNow().notNull(),
	type: saleTypeEnum("type").notNull(),
	total: numeric("total", { precision: 12, scale: 2 }).notNull(),
	totalProfit: numeric("total_profit", { precision: 12, scale: 2 }).notNull(),
	createdAt: createdAt(),
});
