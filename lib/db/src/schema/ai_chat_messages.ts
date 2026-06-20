import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-member conversation memory for the "น้องอควา" AI assistant. One row per turn-side
// (role = "user" | "assistant"), so the chat follows the member across devices.
export const aiChatMessagesTable = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiChatMessage = typeof aiChatMessagesTable.$inferSelect;
