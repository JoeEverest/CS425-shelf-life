import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";

export const users = pgTable("users", {
	id: id(),
	name: text("name").notNull(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	active: boolean("active").default(true).notNull(),
	createdAt: createdAt(),
});
