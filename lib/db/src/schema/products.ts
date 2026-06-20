import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// Shop products / merchandise (e.g. swim gear, drinks). Admin-managed catalog.
export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  category: text("category"),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  imageUrl: text("image_url"),
  stock: integer("stock"), // null = not tracked
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof productsTable.$inferSelect;
