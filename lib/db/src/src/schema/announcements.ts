import { pgTable, serial, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const announcementTypeEnum = pgEnum("announcement_type", ["info", "warning", "success", "maintenance"]);

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull(),
  content: text("content").notNull(),
  contentEn: text("content_en").notNull(),
  type: announcementTypeEnum("type").notNull().default("info"),
  isPublished: boolean("is_published").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export type Announcement = typeof announcementsTable.$inferSelect;
