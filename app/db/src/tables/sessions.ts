import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { users } from "./users";

export const sessions = pgTable("sessions", {
	id: id(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	tokenHash: text("token_hash").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: createdAt(),
});
