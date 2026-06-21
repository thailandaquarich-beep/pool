import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const topupMethodEnum = pgEnum("topup_method", ["bank_transfer", "qr_payment", "slip"]);
export const topupStatusEnum = pgEnum("topup_status", ["pending", "approved", "rejected"]);

export const topupRequestsTable = pgTable("topup_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: topupMethodEnum("method").notNull().default("bank_transfer"),
  slipImageUrl: text("slip_image_url"),
  note: text("note"),
  status: topupStatusEnum("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  branchId: integer("branch_id").default(1),
});

export type TopupRequest = typeof topupRequestsTable.$inferSelect;
