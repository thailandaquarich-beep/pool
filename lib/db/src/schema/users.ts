import { pgTable, serial, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["admin", "member", "instructor", "super_admin", "staff"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  houseNumber: text("house_number"),
  weight: integer("weight"),
  height: integer("height"),
  phone: text("phone").notNull(),
  // Verified phone in E.164 (set on Firebase phone-verified registration). Unique & nullable.
  phoneE164: text("phone_e164").unique(),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  email: text("email").unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  checkinToken: text("checkin_token").unique(),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
