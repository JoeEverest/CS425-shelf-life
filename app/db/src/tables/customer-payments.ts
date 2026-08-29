import { sql } from "drizzle-orm";
import { check, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { invoices } from "./invoices";
import { users } from "./users";

export const customerPayments = pgTable(
	"customer_payments",
	{
		id: id(),
		invoiceId: uuid("invoice_id")
			.notNull()
			.references(() => invoices.id),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
		recordedBy: uuid("recorded_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [
		check("customer_payments_amount_positive", sql`${table.amount} > 0`),
	],
);
