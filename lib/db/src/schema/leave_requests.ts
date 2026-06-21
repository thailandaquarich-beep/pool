import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Staff leave requests ("ระบบลางาน"). An employee submits a request (type + date
// range + reason); an admin approves/rejects it. Complements the attendance clock.
export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("personal"), // sick | personal | vacation | other
  startDate: text("start_date").notNull(), // YYYY-MM-DD (Asia/Bangkok)
  endDate: text("end_date").notNull(),     // YYYY-MM-DD
  days: integer("days").notNull().default(1), // inclusive day count
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | cancelled
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  branchId: integer("branch_id").default(1),
});

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
