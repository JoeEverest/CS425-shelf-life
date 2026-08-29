import { pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";

export const categories = pgTable("categories", {
	id: id(),
	name: text("name").notNull().unique(),
	createdAt: createdAt(),
});
