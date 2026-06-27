import { Router } from "express";
import { db, reservationsTable, usersTable, facilitiesTable, instructorsTable, membershipPackagesTable, branchesTable, ordersTable, attendanceTable, transactionsTable } from "@workspace/db";
import { eq, gte, lte, and, sql, inArray, isNull, asc } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq } from "../middlewares/branch.js";
import { memberCode } from "../lib/memberCode.js";
import { bangkokDate } from "../lib/date.js";

const router = Router();

// GET /stats/public — lightweight, non-sensitive aggregate counts for the public
// landing page (no auth). Powers the live hero numbers; reflects admin changes.
router.get("/public", async (_req, res) => {
  try {
    const [{ members }] = await db
      .select({ members: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "member"));
    const [{ instructors }] = await db
      .select({ instructors: sql<number>`count(*)::int` })
      .from(instructorsTable)
      .where(eq(instructorsTable.status, "active"));
    const [{ facilities }] = await db
      .select({ facilities: sql<number>`count(*)::int` })
      .from(facilitiesTable)
      .where(eq(facilitiesTable.isActive, true));
    const [{ packages }] = await db
      .select({ packages: sql<number>`count(*)::int` })
      .from(membershipPackagesTable)
      .where(eq(membershipPackagesTable.isActive, true));
    const [{ reservations }] = await db
      .select({ reservations: sql<number>`count(*)::int` })
      .from(reservationsTable);
    return res.json({ members, instructors, facilities, packages, reservations });
  } catch {
    return res.status(500).json({ error: "Failed to get public stats" });
  }
});

// GET /stats/branches — cross-branch oversight for super_admin (per-branch + grand totals).
router.get("/branches", authenticate, async (req, res) => {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Forbidden: super admin only" });
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

    const branches = await db.select().from(branchesTable).orderBy(asc(branchesTable.id));
    const members = await db.select({ b: usersTable.branchId, n: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "member")).groupBy(usersTable.branchId);
    const resTotal = await db.select({ b: reservationsTable.branchId, n: sql<number>`count(*)::int` }).from(reservationsTable).groupBy(reservationsTable.branchId);
    const resToday = await db.select({ b: reservationsTable.branchId, n: sql<number>`count(*)::int` }).from(reservationsTable).where(eq(reservationsTable.date, today)).groupBy(reservationsTable.branchId);
    const revenue = await db.select({ b: ordersTable.branchId, total: sql<number>`coalesce(sum(${ordersTable.subtotal}),0)::float` }).from(ordersTable).where(inArray(ordersTable.status, ["paid", "shipped"])).groupBy(ordersTable.branchId);
    const specialPackageRevenue = await db
      .select({
        b: usersTable.branchId,
        total: sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
        count: sql<number>`count(${transactionsTable.id})::int`,
      })
      .from(transactionsTable)
      .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(and(eq(transactionsTable.type, "package_purchase"), eq(transactionsTable.status, "completed")))
      .groupBy(usersTable.branchId);
    const onDuty = await db.select({ b: attendanceTable.branchId, n: sql<number>`count(*)::int` }).from(attendanceTable).where(isNull(attendanceTable.clockOut)).groupBy(attendanceTable.branchId);

    const map = (rows: any[], key = "n") => new Map(rows.map((r) => [r.b, r[key]]));
    const M = map(members), RT = map(resTotal), RD = map(resToday), RV = map(revenue, "total"), SP = map(specialPackageRevenue, "total"), SPC = map(specialPackageRevenue, "count"), DU = map(onDuty);

    const list = branches.map((b) => ({
      id: b.id, name: b.name, nameEn: b.nameEn, code: b.code, isMain: b.isMain, isActive: b.isActive,
      members: M.get(b.id) || 0,
      reservations: RT.get(b.id) || 0,
      reservationsToday: RD.get(b.id) || 0,
      orderRevenue: RV.get(b.id) || 0,
      specialPackageRevenue: SP.get(b.id) || 0,
      specialPackageCount: SPC.get(b.id) || 0,
      revenue: (RV.get(b.id) || 0) + (SP.get(b.id) || 0),
      onDuty: DU.get(b.id) || 0,
    }));
    const totals = list.reduce((a, b) => ({
      members: a.members + b.members, reservations: a.reservations + b.reservations,
      reservationsToday: a.reservationsToday + b.reservationsToday,
      orderRevenue: a.orderRevenue + b.orderRevenue,
      specialPackageRevenue: a.specialPackageRevenue + b.specialPackageRevenue,
      specialPackageCount: a.specialPackageCount + b.specialPackageCount,
      revenue: a.revenue + b.revenue,
      onDuty: a.onDuty + b.onDuty,
    }), { members: 0, reservations: 0, reservationsToday: 0, orderRevenue: 0, specialPackageRevenue: 0, specialPackageCount: 0, revenue: 0, onDuty: 0 });

    return res.json({ branches: list, totals });
  } catch {
    return res.status(500).json({ error: "Failed to build branch overview" });
  }
});

// GET /stats/admin
router.get("/admin", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const today = bangkokDate();
    const monthStart = today.slice(0, 7) + "-01";
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    // Branch scope: super_admin (all) → undefined; branch admin → their branch only.
    const uBranch = branchEq(req, usersTable.branchId);
    const rBranch = branchEq(req, reservationsTable.branchId);

    const [{ totalMembers }] = await db
      .select({ totalMembers: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(uBranch);

    const [{ totalReservations }] = await db
      .select({ totalReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(rBranch);

    const [{ todayReservations }] = await db
      .select({ todayReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(eq(reservationsTable.date, today), rBranch));

    const [{ monthReservations }] = await db
      .select({ monthReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(gte(reservationsTable.date, monthStart), lte(reservationsTable.date, monthEnd), rBranch));

    const [{ upcomingReservations }] = await db
      .select({ upcomingReservations: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(gte(reservationsTable.date, today), inArray(reservationsTable.status, ["confirmed", "pending"]), rBranch));

    const [{ cancelledThisMonth }] = await db
      .select({ cancelledThisMonth: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          gte(reservationsTable.date, monthStart),
          lte(reservationsTable.date, monthEnd),
          eq(reservationsTable.status, "cancelled"),
          rBranch
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
    const today = bangkokDate();
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
