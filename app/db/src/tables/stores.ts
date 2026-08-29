import { char, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";

export const stores = pgTable("stores", {
	id: id(),
	name: text("name").notNull(),
	currency: char("currency", { length: 3 }).notNull(),
	address: text("address").notNull(),
	velocityWindowDays: integer("velocity_window_days").default(30).notNull(),
	lowStockCoverDays: integer("low_stock_cover_days").default(7).notNull(),
	createdAt: createdAt(),
});
