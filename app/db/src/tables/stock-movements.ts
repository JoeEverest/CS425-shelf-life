import {
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { products } from "./products";
import { users } from "./users";

export const stockMovementReasonEnum = pgEnum("stock_movement_reason", [
	"sale",
	"credit_sale",
	"delivery",
	"adjustment",
]);

export const stockMovements = pgTable("stock_movements", {
	id: id(),
	productId: uuid("product_id")
		.notNull()
		.references(() => products.id),
	deltaUnits: integer("delta_units").notNull(),
	reason: stockMovementReasonEnum("reason").notNull(),
	refTable: text("ref_table").notNull(),
	refId: uuid("ref_id").notNull(),
	actorId: uuid("actor_id")
		.notNull()
		.references(() => users.id),
	note: text("note"),
	occurredAt: timestamp("occurred_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	createdAt: createdAt(),
});
