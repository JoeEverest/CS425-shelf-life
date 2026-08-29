import { sql } from "drizzle-orm";
import { check, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { customers } from "./customers";
import { sales } from "./sales";

export const invoices = pgTable(
	"invoices",
	{
		id: id(),
		saleId: uuid("sale_id")
			.notNull()
			.unique()
			.references(() => sales.id),
		customerId: uuid("customer_id")
			.notNull()
			.references(() => customers.id),
		total: numeric("total", { precision: 12, scale: 2 }).notNull(),
		balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
		issuedAt: timestamp("issued_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("invoices_balance_nonnegative", sql`${table.balance} >= 0`),
	],
);
