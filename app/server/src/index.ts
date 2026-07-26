import { createDb, readDatabaseEnv } from "db";
import { createApp } from "./app";

const { DATABASE_URL } = readDatabaseEnv();

export const app = createApp(createDb(DATABASE_URL));

export default app;
