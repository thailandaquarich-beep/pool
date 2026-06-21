import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { memberPackagesTable } from "./member_packages";

// One row per consumed package "use" — created when a booking is confirmed or a
// member is checked in via QR. Powers usage history and refunds (decrement on cancel).
export const packageUsagesTable = pgTable("package_usages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  memberPackageId: integer("member_package_id").notNull().references(() => memberPackagesTable.id, { onDelete: "cascade" }),
  reservationId: integer("reservation_id"),
  source: text("source").notNull().default("booking"), // "booking" | "checkin"
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type PackageUsage = typeof packageUsagesTable.$inferSelect;
