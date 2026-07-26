import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./env";
export * from "./schema";
export { schema };

export type DatabaseClient = ReturnType<typeof postgres>;

export function client(connectionString: string): DatabaseClient {
	return postgres(connectionString);
}

function connect(queryClient: DatabaseClient) {
	return drizzle(queryClient, { schema });
}

export type Database = ReturnType<typeof connect>;

export function createDb(connection: string | DatabaseClient): Database {
	const queryClient =
		typeof connection === "string" ? client(connection) : connection;
	return connect(queryClient);
}
