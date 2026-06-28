import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const membershipPackagesTable = pgTable("membership_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull(),
  // Activity category (ว่ายน้ำ / แอโรบิคในน้ำ / ฟิตเนส / อื่นๆ). Groups packages and
  // filters the course picker in the instructor teaching system.
  category: text("category"),
  description: text("description"),
  descriptionEn: text("description_en"),
  imageUrl: text("image_url"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  benefits: text("benefits"),
  benefitsEn: text("benefits_en"),
  maxBookingsPerMonth: integer("max_bookings_per_month"),
  bookingDiscount: numeric("booking_discount", { precision: 5, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type MembershipPackage = typeof membershipPackagesTable.$inferSelect;
