import { numeric, pgTable, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { products } from "./products";
import { users } from "./users";

export const priceChanges = pgTable("price_changes", {
	id: id(),
	productId: uuid("product_id")
		.notNull()
		.references(() => products.id),
	oldPrice: numeric("old_price", { precision: 12, scale: 2 }),
	newPrice: numeric("new_price", { precision: 12, scale: 2 }).notNull(),
	changedBy: uuid("changed_by")
		.notNull()
		.references(() => users.id),
	createdAt: createdAt(),
});
