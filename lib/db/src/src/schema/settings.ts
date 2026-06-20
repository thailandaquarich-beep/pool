import { pgTable, serial, boolean, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  bookingEnabled: boolean("booking_enabled").notNull().default(true),
  openTime: text("open_time").notNull().default("06:00"),
  closeTime: text("close_time").notNull().default("20:00"),
  maxPeoplePerSlot: integer("max_people_per_slot").notNull().default(20),
  maxAdvanceDays: integer("max_advance_days").notNull().default(30),
  slotDurationMinutes: integer("slot_duration_minutes").notNull().default(60),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
});

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
