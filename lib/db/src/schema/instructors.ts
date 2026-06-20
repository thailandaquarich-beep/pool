import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const instructorStatusEnum = pgEnum("instructor_status", ["active", "on_leave", "inactive"]);

export const instructorsTable = pgTable("instructors", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  specialty: text("specialty").notNull(),
  certification: text("certification"),
  experience: text("experience"),
  biography: text("biography"),
  profileImageUrl: text("profile_image_url"),
  status: instructorStatusEnum("status").notNull().default("active"),
  userId: integer("user_id"), // links to a users row (role=instructor) so the instructor can log in
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Instructor = typeof instructorsTable.$inferSelect;
