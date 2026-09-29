import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Placeholder table; replace with the app's real schema.
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});
