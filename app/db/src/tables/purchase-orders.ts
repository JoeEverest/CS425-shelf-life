import { pgEnum, pgTable, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { suppliers } from "./suppliers";
import { users } from "./users";

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
	"open",
	"partially_received",
	"received",
]);

export const purchaseOrders = pgTable("purchase_orders", {
	id: id(),
	supplierId: uuid("supplier_id")
		.notNull()
		.references(() => suppliers.id),
	status: purchaseOrderStatusEnum("status").default("open").notNull(),
	createdBy: uuid("created_by")
		.notNull()
		.references(() => users.id),
	createdAt: createdAt(),
});
