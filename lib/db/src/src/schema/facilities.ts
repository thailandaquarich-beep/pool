import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Facility = typeof facilitiesTable.$inferSelect;
