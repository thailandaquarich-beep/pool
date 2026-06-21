import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { facilitiesTable } from "./facilities";

// แพ็คเกจเสริม that a member has purchased (one row per purchase).
export const memberAddonsTable = pgTable("member_addons", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  facilityId: integer("facility_id").notNull().references(() => facilitiesTable.id),
  name: text("name").notNull(), // snapshot of facility name at purchase time
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MemberAddon = typeof memberAddonsTable.$inferSelect;
