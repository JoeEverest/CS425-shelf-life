import { sql } from "drizzle-orm";
import { check, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { products } from "./products";

export const stockLevels = pgTable(
	"stock_levels",
	{
		productId: uuid("product_id")
			.primaryKey()
			.references(() => products.id),
		qtyUnits: integer("qty_units").default(0).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("stock_levels_qty_units_nonnegative", sql`${table.qtyUnits} >= 0`),
	],
);
