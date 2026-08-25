import { beforeAll, describe, expect, test } from "bun:test";
import { client, createDb } from "db";
import { migrateDatabase } from "db/testing";
import { createApp } from "../src/app";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for server integration tests. See app/.env.example.",
	);
}

const testClient = client(testDatabaseUrl);
const testDb = createDb(testClient);
const app = createApp(testDb);

beforeAll(async () => {
	await migrateDatabase(testDb);
});

describe("health", () => {
	test("liveness returns ok without touching the database", async () => {
		const response = await app.request("/api/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	});

	test("readiness reports the database is reachable", async () => {
		const response = await app.request("/api/health/readiness");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ready",
			database: "ok",
		});
	});

	test("readiness returns 503 when the database is unreachable", async () => {
		// A client pointed at a dead port surfaces the unready path.
		const deadClient = client(
			"postgres://shelflife:shelflife@127.0.0.1:1/shelflife",
		);
		const deadApp = createApp(createDb(deadClient));
		const response = await deadApp.request("/api/health/readiness");
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			status: "unready",
			database: "unreachable",
		});
		await deadClient.end({ timeout: 1 });
	});
});
