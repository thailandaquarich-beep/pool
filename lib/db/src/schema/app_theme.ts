import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Single-row table holding the site-wide theme accent color (JSON of {h,s,l}).
// Edited by admins; served publicly so every client (even logged-out) recolors live.
export const appThemeTable = pgTable("app_theme", {
  id: serial("id").primaryKey(),
  data: text("data"), // JSON: { h: number, s: number, l: number } | null
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppTheme = typeof appThemeTable.$inferSelect;
