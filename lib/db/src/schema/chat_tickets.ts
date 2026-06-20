import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ticketTypeEnum = pgEnum("ticket_type", [
  "question",
  "complaint",
  "suggestion",
  "support",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const chatTicketsTable = pgTable("chat_tickets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  type: ticketTypeEnum("type").notNull().default("question"),
  status: ticketStatusEnum("status").notNull().default("open"),
  assignedTo: integer("assigned_to").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export type ChatTicket = typeof chatTicketsTable.$inferSelect;
