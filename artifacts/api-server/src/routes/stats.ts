import { Router } from "express";
import { db, reservationsTable, usersTable } from "@workspace/db";
import { eq, gte, lte, and, sql, inArray } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { memberCode } from "../lib/memberCode.js";

const router = Router();

// GET /stats/admin
router.get("/admin", authenticate, requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 7) + "-01";
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const [{ totalMembers }] = await db
      .select({ totalMembers: sql<number>`count(*)::int` })
      .from(usersTable);

    const [{ totalReservations }] = await db
      .select({ totalReservations: sql<number>`count(*)::int` })
      .from(reservationsTable);

    const [{ todayReservations }] = await db
      .select({ todayReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(eq(reservationsTable.date, today));

    const [{ monthReservations }] = await db
      .select({ monthReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(gte(reservationsTable.date, monthStart), lte(reservationsTable.date, monthEnd)));

    const [{ upcomingReservations }] = await db
      .select({ upcomingReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(gte(reservationsTable.date, today), inArray(reservationsTable.status, ["confirmed", "pending"])));

    const [{ cancelledThisMonth }] = await db
      .select({ cancelledThisMonth: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          gte(reservationsTable.date, monthStart),
          lte(reservationsTable.date, monthEnd),
          eq(reservationsTable.status, "cancelled")
        )
      );

    return res.json({
      totalMembers,
      totalReservations,
      todayReservations,
      monthReservations,
      upcomingReservations,
      cancelledThisMonth,
    });
  } catch {
    return res.status(500).json({ error: "Failed to get admin stats" });
  }
});

// GET /stats/member
router.get("/member", authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 7) + "-01";
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const userId = req.user!.userId;

    const [{ totalReservations }] = await db
      .select({ totalReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(eq(reservationsTable.userId, userId));

    const [{ upcomingCount }] = await db
      .select({ upcomingCount: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.userId, userId),
          gte(reservationsTable.date, today),
          inArray(reservationsTable.status, ["confirmed", "pending"])
        )
      );

    const [{ cancelledCount }] = await db
      .select({ cancelledCount: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(eq(reservationsTable.userId, userId), eq(reservationsTable.status, "cancelled")));

    const [{ thisMonthCount }] = await db
      .select({ thisMonthCount: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.userId, userId),
          gte(reservationsTable.date, monthStart),
          lte(reservationsTable.date, monthEnd)
        )
      );

    return res.json({ totalReservations, upcomingCount, cancelledCount, thisMonthCount });
  } catch {
    return res.status(500).json({ error: "Failed to get member stats" });
  }
});

// GET /stats/monthly
router.get("/monthly", authenticate, requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const rows = await db
      .select({
        month: sql<string>`to_char(${reservationsTable.date}::date, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
        cancelled: sql<number>`sum(case when ${reservationsTable.status} = 'cancelled' then 1 else 0 end)::int`,
      })
      .from(reservationsTable)
      .where(sql`extract(year from ${reservationsTable.date}::date) = ${year}`)
      .groupBy(sql`to_char(${reservationsTable.date}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${reservationsTable.date}::date, 'YYYY-MM')`);

    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to get monthly stats" });
  }
});

// GET /stats/top-users
router.get("/top-users", authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        houseNumber: usersTable.houseNumber,
        reservationCount: sql<number>`count(${reservationsTable.id})::int`,
      })
      .from(usersTable)
      .leftJoin(reservationsTable, eq(reservationsTable.userId, usersTable.id))
      .groupBy(usersTable.id, usersTable.firstName, usersTable.lastName, usersTable.houseNumber)
      .orderBy(sql`count(${reservationsTable.id}) DESC`)
      .limit(10);

    return res.json(rows.map((r) => ({ ...r, memberCode: memberCode(r.id) })));
  } catch {
    return res.status(500).json({ error: "Failed to get top users" });
  }
});

export default router;
