import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database, DatabaseClient } from "./index";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function migrateDatabase(database: Database) {
	await migrate(database, { migrationsFolder });
}

export async function truncateDatabase(queryClient: DatabaseClient) {
	await queryClient.unsafe(`
		TRUNCATE TABLE
			customer_payments,
			invoices,
			sale_lines,
			sales,
			expenses,
			receipt_lines,
			goods_receipts,
			supplier_payments,
			po_lines,
			purchase_orders,
			stock_movements,
			stock_levels,
			products,
			categories,
			customers,
			suppliers,
			sessions,
			user_roles,
			users,
			stores
		RESTART IDENTITY CASCADE
	`);
}
