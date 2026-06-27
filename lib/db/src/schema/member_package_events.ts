import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { memberPackagesTable } from "./member_packages";

export const memberPackageEventsTable = pgTable("member_package_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  memberPackageId: integer("member_package_id").references(() => memberPackagesTable.id, { onDelete: "set null" }),
  adminId: integer("admin_id").references(() => usersTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  note: text("note"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type MemberPackageEvent = typeof memberPackageEventsTable.$inferSelect;
