import { defineConfig } from "drizzle-kit";
import { readDatabaseEnv } from "./src/env";

const env = readDatabaseEnv();

export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: env.DATABASE_URL,
	},
	strict: true,
	verbose: true,
});
