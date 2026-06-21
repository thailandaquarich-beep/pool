import { pgTable, serial, boolean, integer, text, numeric } from "drizzle-orm/pg-core";
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
  bookingPricePerSession: numeric("booking_price_per_session", { precision: 10, scale: 2 }).notNull().default("0"),
  bookingAutoConfirm: boolean("booking_auto_confirm").notNull().default(false),
  lineUrl: text("line_url").default("https://line.me/"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  bankAccountName: text("bank_account_name"),
  bankAccountNumber: text("bank_account_number"),
  bankName: text("bank_name"),
  promptpayNumber: text("promptpay_number"),
  branchId: integer("branch_id").default(1),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
});

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
