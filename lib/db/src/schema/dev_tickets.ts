import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Admin -> DEV support tickets ("ศูนย์ช่วยเหลือ"). An admin (any admin/super_admin)
// opens a ticket to reach the developer; super_admin acts as DEV and replies in-app.
// Kept separate from member<->admin chat_tickets so the two inboxes never mix.
export const devTicketsTable = pgTable("dev_tickets", {
  id: serial("id").primaryKey(),
  openedBy: integer("opened_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  type: text("type").notNull().default("question"), // bug | question | feature | other
  priority: text("priority").notNull().default("normal"), // low | normal | high | urgent
  status: text("status").notNull().default("open"), // open | in_progress | resolved | closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export type DevTicket = typeof devTicketsTable.$inferSelect;
