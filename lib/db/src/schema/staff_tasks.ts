import { pgEnum, pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const staffTaskStatusEnum = pgEnum("staff_task_status", [
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
]);

export const staffTasksTable = pgTable("staff_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  taskDate: text("task_date").notNull(), // YYYY-MM-DD (Asia/Bangkok)
  assignedTo: integer("assigned_to").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  status: staffTaskStatusEnum("status").notNull().default("assigned"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  startPhotoUrl: text("start_photo_url"),
  startPhotoTakenAt: timestamp("start_photo_taken_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  endPhotoUrl: text("end_photo_url"),
  endPhotoTakenAt: timestamp("end_photo_taken_at", { withTimezone: true }),
  completionNote: text("completion_note"),
  branchId: integer("branch_id").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffTask = typeof staffTasksTable.$inferSelect;
