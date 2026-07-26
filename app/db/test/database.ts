import { client, createDb } from "../src";
import { migrateDatabase, truncateDatabase } from "../src/testing";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for database integration tests. See app/.env.example.",
	);
}

export const testClient = client(testDatabaseUrl);
export const testDb = createDb(testClient);

export async function migrateTestDatabase() {
	await migrateDatabase(testDb);
}

export async function truncateTables() {
	await truncateDatabase(testClient);
}

export async function closeTestDatabase() {
	await testClient.end();
}
