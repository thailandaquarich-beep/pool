import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { devTicketsTable } from "./dev_tickets";
import { usersTable } from "./users";

// One message in a DEV support thread. `fromDev` = true when the sender is the
// DEV side (a super_admin reply); false when it's the admin who opened the ticket.
// `isRead` tracks whether the *recipient* side has seen it (each message has
// exactly one recipient: dev for admin messages, opener for dev replies).
export const devTicketMessagesTable = pgTable("dev_ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => devTicketsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  message: text("message").notNull().default(""),
  imageUrl: text("image_url"), // base64 screenshot attachment
  fromDev: boolean("from_dev").notNull().default(false),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DevTicketMessage = typeof devTicketMessagesTable.$inferSelect;
