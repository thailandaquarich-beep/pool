import { Router } from "express";
import { db, attendanceTable, usersTable } from "@workspace/db";
import { eq, and, isNull, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { authenticate, requireStaff, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";

// Staff work-time tracking ("ระบบลงเวลางาน"). Staff (admin/super_admin/instructor)
// clock in/out for themselves; admins additionally see who is on duty and pull
// per-employee hour reports. Designed to become branch-aware later (franchise).
const router = Router();

// Local (Asia/Bangkok) calendar day as YYYY-MM-DD.
const bkkDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

function serialize(r: typeof attendanceTable.$inferSelect) {
  return {
    ...r,
    clockIn: r.clockIn.toISOString(),
    clockOut: r.clockOut ? r.clockOut.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

// ───────────────────────────── self service ─────────────────────────────

// POST /attendance/clock-in — start a shift (fails if one is already open)
router.post("/clock-in", authenticate, requireStaff, attachBranch, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [open] = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.userId, userId), isNull(attendanceTable.clockOut))).limit(1);
    if (open) return res.status(400).json({ error: "open", message: "คุณลงเวลาเข้างานอยู่แล้ว" });

    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : null;
    const [row] = await db.insert(attendanceTable).values({ userId, workDate: bkkDate(), note, branchId: newRowBranch(req) }).returning();
    return res.status(201).json(serialize(row));
  } catch {
    return res.status(500).json({ error: "Failed to clock in" });
  }
});

// POST /attendance/clock-out — close the open shift
router.post("/clock-out", authenticate, requireStaff, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [open] = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.userId, userId), isNull(attendanceTable.clockOut)))
      .orderBy(desc(attendanceTable.clockIn)).limit(1);
    if (!open) return res.status(400).json({ error: "not_open", message: "ยังไม่ได้ลงเวลาเข้างาน" });

    const now = new Date();
    const [row] = await db.update(attendanceTable)
      .set({ clockOut: now, workedMinutes: minutesBetween(open.clockIn, now) })
      .where(eq(attendanceTable.id, open.id)).returning();
    return res.json(serialize(row));
  } catch {
    return res.status(500).json({ error: "Failed to clock out" });
  }
});

// GET /attendance/me — current status + recent history + today/month totals
router.get("/me", authenticate, requireStaff, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [current] = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.userId, userId), isNull(attendanceTable.clockOut)))
      .orderBy(desc(attendanceTable.clockIn)).limit(1);

    const history = await db.select().from(attendanceTable)
      .where(eq(attendanceTable.userId, userId))
      .orderBy(desc(attendanceTable.clockIn)).limit(30);

    const today = bkkDate();
    const month = today.slice(0, 7);
    const [{ todayMinutes }] = await db.select({ todayMinutes: sql<number>`coalesce(sum(${attendanceTable.workedMinutes}),0)::int` })
      .from(attendanceTable).where(and(eq(attendanceTable.userId, userId), eq(attendanceTable.workDate, today)));
    const [{ monthMinutes }] = await db.select({ monthMinutes: sql<number>`coalesce(sum(${attendanceTable.workedMinutes}),0)::int` })
      .from(attendanceTable).where(and(eq(attendanceTable.userId, userId), sql`${attendanceTable.workDate} like ${month + "%"}`));

    return res.json({
      current: current ? serialize(current) : null,
      history: history.map(serialize),
      todayMinutes, monthMinutes,
    });
  } catch {
    return res.status(500).json({ error: "Failed to load attendance" });
  }
});

// ───────────────────────────── admin oversight ─────────────────────────────

// GET /attendance/on-duty — everyone currently clocked in (admin)
router.get("/on-duty", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const rows = await db.select({
      a: attendanceTable,
      user: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, profileImageUrl: usersTable.profileImageUrl },
    }).from(attendanceTable)
      .innerJoin(usersTable, eq(attendanceTable.userId, usersTable.id))
      .where(and(isNull(attendanceTable.clockOut), branchEq(req, attendanceTable.branchId)))
      .orderBy(desc(attendanceTable.clockIn));
    return res.json(rows.map(r => ({ ...serialize(r.a), user: r.user })));
  } catch {
    return res.status(500).json({ error: "Failed to load on-duty list" });
  }
});

// GET /attendance/report?from=YYYY-MM-DD&to=YYYY-MM-DD&userId= — records + per-employee totals (admin)
router.get("/report", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const today = bkkDate();
    const from = (req.query.from as string) || today.slice(0, 7) + "-01";
    const to = (req.query.to as string) || today;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

    const conds: any[] = [gte(attendanceTable.workDate, from), lte(attendanceTable.workDate, to)];
    if (userId) conds.push(eq(attendanceTable.userId, userId));
    const bf = branchEq(req, attendanceTable.branchId);
    if (bf) conds.push(bf);

    const rows = await db.select({
      a: attendanceTable,
      user: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, profileImageUrl: usersTable.profileImageUrl },
    }).from(attendanceTable)
      .innerJoin(usersTable, eq(attendanceTable.userId, usersTable.id))
      .where(and(...conds))
      .orderBy(desc(attendanceTable.clockIn))
      .limit(1000);

    // per-employee aggregates over the range
    const totals = new Map<number, { user: any; totalMinutes: number; shifts: number }>();
    for (const r of rows) {
      const t = totals.get(r.user.id) || { user: r.user, totalMinutes: 0, shifts: 0 };
      t.totalMinutes += r.a.workedMinutes || 0;
      t.shifts += 1;
      totals.set(r.user.id, t);
    }

    return res.json({
      from, to,
      records: rows.map(r => ({ ...serialize(r.a), user: r.user })),
      summary: Array.from(totals.values()).sort((a, b) => b.totalMinutes - a.totalMinutes),
    });
  } catch {
    return res.status(500).json({ error: "Failed to build report" });
  }
});

// GET /attendance/staff — list of staff users (for the manual-entry / filter dropdown) (admin)
router.get("/staff", authenticate, requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable).where(inArray(usersTable.role, ["admin", "super_admin", "instructor", "staff"]))
      .orderBy(usersTable.firstName);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to list staff" });
  }
});

// POST /attendance/manual — admin adds a completed shift on someone's behalf
router.post("/manual", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const { userId, clockIn, clockOut, note } = req.body || {};
    if (!userId || !clockIn) return res.status(400).json({ error: "userId and clockIn required" });
    const ci = new Date(clockIn);
    const co = clockOut ? new Date(clockOut) : null;
    if (isNaN(ci.getTime()) || (co && isNaN(co.getTime()))) return res.status(400).json({ error: "Invalid date" });
    const [row] = await db.insert(attendanceTable).values({
      userId: Number(userId), workDate: bkkDate(ci), clockIn: ci, clockOut: co,
      workedMinutes: co ? minutesBetween(ci, co) : null, method: "manual",
      note: typeof note === "string" ? note.slice(0, 300) : null,
      branchId: newRowBranch(req),
    }).returning();
    return res.status(201).json(serialize(row));
  } catch {
    return res.status(500).json({ error: "Failed to add record" });
  }
});

// PATCH /attendance/:id — admin corrects times / note
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const { clockIn, clockOut, note } = req.body || {};
    const ci = clockIn ? new Date(clockIn) : existing.clockIn;
    const co = clockOut === null ? null : clockOut ? new Date(clockOut) : existing.clockOut;
    if (isNaN(ci.getTime()) || (co && isNaN(co.getTime()))) return res.status(400).json({ error: "Invalid date" });

    const [row] = await db.update(attendanceTable).set({
      clockIn: ci, clockOut: co,
      workedMinutes: co ? minutesBetween(ci, co) : null,
      workDate: bkkDate(ci),
      note: note === undefined ? existing.note : (note ? String(note).slice(0, 300) : null),
    }).where(eq(attendanceTable.id, id)).returning();
    return res.json(serialize(row));
  } catch {
    return res.status(500).json({ error: "Failed to update record" });
  }
});

// DELETE /attendance/:id — admin removes a record
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await db.delete(attendanceTable).where(eq(attendanceTable.id, parseInt(req.params.id)));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete record" });
  }
});

export default router;
