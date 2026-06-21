import { pgTable, serial, integer, timestamp, pgEnum, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { membershipPackagesTable } from "./membership_packages";

export const memberPackageStatusEnum = pgEnum("member_package_status", [
  "active",
  "expired",
  "cancelled",
]);

export const memberPackagesTable = pgTable("member_packages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  packageId: integer("package_id").notNull().references(() => membershipPackagesTable.id),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  bookingsUsed: integer("bookings_used").notNull().default(0),
  status: memberPackageStatusEnum("status").notNull().default("active"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type MemberPackage = typeof memberPackagesTable.$inferSelect;
