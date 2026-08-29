import { sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { products } from "./products";
import { purchaseOrders } from "./purchase-orders";

export const poLines = pgTable(
	"po_lines",
	{
		id: id(),
		poId: uuid("po_id")
			.notNull()
			.references(() => purchaseOrders.id),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id),
		qtyBulk: integer("qty_bulk").notNull(),
		bulkCostAtOrder: numeric("bulk_cost_at_order", {
			precision: 12,
			scale: 2,
		}).notNull(),
		createdAt: createdAt(),
	},
	(table) => [check("po_lines_qty_bulk_positive", sql`${table.qtyBulk} > 0`)],
);
