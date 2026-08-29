import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	integer,
	numeric,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { createdAt, id } from "./columns";
import { users } from "./users";

export const products = pgTable(
	"products",
	{
		id: id(),
		sku: text("sku").notNull().unique(),
		name: text("name").notNull(),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => categories.id),
		bulkUnitName: text("bulk_unit_name").notNull(),
		unitsPerBulk: integer("units_per_bulk").notNull(),
		saleUnitName: text("sale_unit_name").notNull(),
		bulkCost: numeric("bulk_cost", { precision: 12, scale: 2 }).notNull(),
		price: numeric("price", { precision: 12, scale: 2 }),
		published: boolean("published").default(false).notNull(),
		archived: boolean("archived").default(false).notNull(),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [
		check("products_units_per_bulk_positive", sql`${table.unitsPerBulk} > 0`),
	],
);
