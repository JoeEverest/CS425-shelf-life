import { sql } from "drizzle-orm";
import { check, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { purchaseOrders } from "./purchase-orders";
import { suppliers } from "./suppliers";
import { users } from "./users";

export const supplierPayments = pgTable(
	"supplier_payments",
	{
		id: id(),
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id),
		poId: uuid("po_id").references(() => purchaseOrders.id),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
		recordedBy: uuid("recorded_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [
		check("supplier_payments_amount_positive", sql`${table.amount} > 0`),
	],
);
