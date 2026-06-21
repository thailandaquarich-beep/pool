import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Staff work-time tracking (admin / super_admin / instructor). One row per shift:
// clock-in creates it; clock-out fills clockOut + workedMinutes. A row whose
// clockOut is null means the person is currently on duty. workDate is the local
// (Asia/Bangkok) day of the clock-in, used for grouping in reports.
export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  workDate: text("work_date").notNull(), // YYYY-MM-DD
  clockIn: timestamp("clock_in", { withTimezone: true }).notNull().defaultNow(),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  workedMinutes: integer("worked_minutes"), // filled on clock-out
  method: text("method").notNull().default("web"), // web | qr | manual
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type Attendance = typeof attendanceTable.$inferSelect;
