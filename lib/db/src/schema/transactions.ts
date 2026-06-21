import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "topup",
  "booking_payment",
  "booking_refund",
  "package_purchase",
  "admin_credit",
  "admin_debit",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
]);

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  description: text("description").notNull(),
  status: transactionStatusEnum("status").notNull().default("completed"),
  referenceId: integer("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchId: integer("branch_id").default(1),
});

export type Transaction = typeof transactionsTable.$inferSelect;
