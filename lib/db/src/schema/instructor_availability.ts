import { pgTable, serial, integer, text, date, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { instructorsTable } from "./instructors";
import { membershipPackagesTable } from "./membership_packages";

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
  maxPeople: integer("max_people").notNull().default(5),
  // Course CATEGORY this slot teaches (e.g. "ว่ายน้ำ"). Members may book it with any
  // package in this category. Newer than packageId (a specific course) which is kept for
  // legacy slots; category takes precedence in booking when set.
  category: text("category"),
  packageId: integer("package_id").references(() => membershipPackagesTable.id, { onDelete: "set null" }),
  note: text("note"),
  isAvailable: boolean("is_available").notNull().default(true), // false = blocked-out slot
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InstructorAvailability = typeof instructorAvailabilityTable.$inferSelect;
