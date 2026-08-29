import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { purchaseOrders } from "./purchase-orders";
import { users } from "./users";

export const goodsReceipts = pgTable("goods_receipts", {
	id: id(),
	poId: uuid("po_id")
		.notNull()
		.references(() => purchaseOrders.id),
	receivedBy: uuid("received_by")
		.notNull()
		.references(() => users.id),
	signedOffAt: timestamp("signed_off_at", { withTimezone: true }).notNull(),
	discrepancyNote: text("discrepancy_note"),
	discrepancyConfirmedBy: uuid("discrepancy_confirmed_by").references(
		() => users.id,
	),
	createdAt: createdAt(),
});
