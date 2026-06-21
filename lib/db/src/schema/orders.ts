import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Product orders (shop checkout). Line items are snapshotted as JSON so price/name
// stay correct even if the product later changes.
export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  items: text("items").notNull(), // JSON: [{ productId, name, price, qty }]
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"), // pending | paid | shipped | cancelled
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(), // บ้านเลขที่ / ถนน
  subdistrict: text("subdistrict"),
  district: text("district"),
  province: text("province"),
  zipcode: text("zipcode"),
  slipImageUrl: text("slip_image_url"), // base64 for display
  slipFilename: text("slip_filename"), // archived file in data/slips
  note: text("note"),
  trackingNo: text("tracking_no"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type Order = typeof ordersTable.$inferSelect;
