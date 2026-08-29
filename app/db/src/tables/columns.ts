import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").defaultRandom().primaryKey();

export const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
