import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Franchise branches ("สาขา"). Every tenant row carries a branch_id; super_admin
// spans all branches, a branch admin/member is confined to their own.
export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  code: text("code").unique(),
  address: text("address"),
  phone: text("phone"),
  ownerName: text("owner_name"),
  email: text("email"),
  lineId: text("line_id"),
  taxId: text("tax_id"),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  logoUrl: text("logo_url"),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true),
  isMain: boolean("is_main").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Branch = typeof branchesTable.$inferSelect;
