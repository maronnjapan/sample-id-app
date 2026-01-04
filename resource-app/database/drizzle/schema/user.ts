import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Example of defining a schema in Drizzle ORM:
export const userTable = sqliteTable("users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  auth0Id: text("auth0_id", { length: 255 }).notNull().unique(),
  email: text("email", { length: 100 }).notNull(),
  isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false),
});

// You can then infer the types for selecting and inserting
export type UserItem = typeof userTable.$inferSelect;
export type UserInsert = typeof userTable.$inferInsert;
