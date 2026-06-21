import { pgTable, serial, text, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

export const facilitiesTable = pgTable("facilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description"),
  descriptionEn: text("description_en"),
  capacity: integer("capacity").notNull().default(20),
  openTime: text("open_time").notNull().default("06:00"),
  closeTime: text("close_time").notNull().default("20:00"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  rules: text("rules"),
  rulesEn: text("rules_en"),
  slotDurationMinutes: integer("slot_duration_minutes").notNull().default(60),
  // extended details (admin-editable)
  location: text("location"),
  phone: text("phone"),
  mapUrl: text("map_url"),
  amenities: text("amenities"),
  depth: text("depth"),
  lanes: integer("lanes"),
  priceInfo: text("price_info"),
  // Add-on package (แพ็คเกจเสริม): members can buy this service directly from the Other Services page
  isPurchasable: boolean("is_purchasable").notNull().default(false),
  price: numeric("price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type Facility = typeof facilitiesTable.$inferSelect;
