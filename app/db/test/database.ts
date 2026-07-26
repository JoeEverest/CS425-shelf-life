import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, createDb } from "../src";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for database integration tests. See app/.env.example.",
	);
}

export const testClient = client(testDatabaseUrl);
export const testDb = createDb(testClient);

export async function migrateTestDatabase() {
	await migrate(testDb, {
		migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
	});
}

export async function truncateTables() {
	await testClient.unsafe(`
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

export async function closeTestDatabase() {
	await testClient.end();
}
