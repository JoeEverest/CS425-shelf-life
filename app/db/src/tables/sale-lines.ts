import { sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { products } from "./products";
import { sales } from "./sales";

export const saleLines = pgTable(
	"sale_lines",
	{
		id: id(),
		saleId: uuid("sale_id")
			.notNull()
			.references(() => sales.id),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id),
		qtyUnits: integer("qty_units").notNull(),
		unitPriceAtSale: numeric("unit_price_at_sale", {
			precision: 12,
			scale: 2,
		}).notNull(),
		unitCostAtSale: numeric("unit_cost_at_sale", {
			precision: 12,
			scale: 4,
		}).notNull(),
		lineCogs: numeric("line_cogs", { precision: 12, scale: 2 }).notNull(),
		lineProfit: numeric("line_profit", {
			precision: 12,
			scale: 2,
		}).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("sale_lines_qty_units_positive", sql`${table.qtyUnits} > 0`),
	],
);
