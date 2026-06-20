import { pgTable, serial, integer, text, date, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { instructorsTable } from "./instructors";

// "weekly" = recurring on dayOfWeek (0=Sun..6=Sat); "date" = a specific calendar date.
export const availabilityKindEnum = pgEnum("availability_kind", ["weekly", "date"]);

export const instructorAvailabilityTable = pgTable("instructor_availability", {
  id: serial("id").primaryKey(),
  instructorId: integer("instructor_id").notNull().references(() => instructorsTable.id, { onDelete: "cascade" }),
  kind: availabilityKindEnum("kind").notNull(),
  dayOfWeek: integer("day_of_week"), // for kind=weekly (0..6)
  date: date("date"),               // for kind=date (YYYY-MM-DD)
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(),
  note: text("note"),
  isAvailable: boolean("is_available").notNull().default(true), // false = blocked-out slot
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InstructorAvailability = typeof instructorAvailabilityTable.$inferSelect;
