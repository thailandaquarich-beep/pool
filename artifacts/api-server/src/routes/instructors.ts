import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, instructorsTable, reservationsTable, instructorAvailabilityTable, usersTable, settingsTable } from "@workspace/db";
import { eq, ilike, or, sql, and, inArray, isNotNull, asc, gte, lte, ne } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";
import { consumeUse, refundUseForReservation, NoQuotaError } from "../lib/packageUsage.js";
import { initMemberFolder } from "../lib/memberLog.js";

const router = Router();

const availOrder = [
  asc(instructorAvailabilityTable.kind), asc(instructorAvailabilityTable.dayOfWeek),
  asc(instructorAvailabilityTable.date), asc(instructorAvailabilityTable.startTime),
] as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_INSTRUCTOR_MAX_PEOPLE_PER_SLOT = 5;
const INSTRUCTOR_MAX_PEOPLE_PER_SLOT = 99;
const bkkDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });

function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

async function getSettings(branchId: number) {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.branchId, branchId)).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(settingsTable).values({ branchId }).returning();
  return created;
}

function validateAvailability(input: any): string | null {
  if (input.kind !== "weekly" && input.kind !== "date") return "kind must be weekly|date";
  if (!TIME_RE.test(String(input.startTime || "")) || !TIME_RE.test(String(input.endTime || "")))
    return "กรุณาระบุเวลาในรูปแบบ HH:MM";
  if (timeMinutes(input.startTime) >= timeMinutes(input.endTime)) return "เวลาเริ่มต้องก่อนเวลาสิ้นสุด";
  if (input.kind === "weekly" && (!Number.isInteger(Number(input.dayOfWeek)) || Number(input.dayOfWeek) < 0 || Number(input.dayOfWeek) > 6))
    return "dayOfWeek (0-6) required for weekly";
  if (input.kind === "date") {
    if (!DATE_RE.test(String(input.date || ""))) return "กรุณาระบุวันที่ให้ถูกต้อง";
    if (String(input.date) < bkkDay.format(new Date())) return "ไม่สามารถลงตารางย้อนหลังได้";
  }
  return null;
}

function parseMaxPeople(value: unknown, fallback = DEFAULT_INSTRUCTOR_MAX_PEOPLE_PER_SLOT) {
  const n = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > INSTRUCTOR_MAX_PEOPLE_PER_SLOT) return null;
  return n;
}

function availabilityOverlaps(a: any, b: any) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "weekly" && Number(a.dayOfWeek) !== Number(b.dayOfWeek)) return false;
  if (a.kind === "date" && String(a.date) !== String(b.date)) return false;
  return timeMinutes(a.startTime) < timeMinutes(b.endTime) && timeMinutes(a.endTime) > timeMinutes(b.startTime);
}

function instructorCapacityForSlot(rows: (typeof instructorAvailabilityTable.$inferSelect)[], date: string, startTime: string, endTime: string) {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const applies = (row: typeof instructorAvailabilityTable.$inferSelect) =>
    (row.kind === "date" && row.date === date) || (row.kind === "weekly" && row.dayOfWeek === dayOfWeek);
  const covers = (row: typeof instructorAvailabilityTable.$inferSelect) =>
    timeMinutes(row.startTime) <= timeMinutes(startTime) && timeMinutes(row.endTime) >= timeMinutes(endTime);
  const overlaps = (row: typeof instructorAvailabilityTable.$inferSelect) =>
    timeMinutes(row.startTime) < timeMinutes(endTime) && timeMinutes(row.endTime) > timeMinutes(startTime);
  const relevant = rows.filter(applies);
  if (relevant.some((row) => !row.isAvailable && overlaps(row))) return null;
  const available = relevant.filter((row) => row.isAvailable && covers(row));
  if (!available.length) return null;
  return Math.max(...available.map((row) => row.maxPeople ?? DEFAULT_INSTRUCTOR_MAX_PEOPLE_PER_SLOT));
}

function isInstructorAvailable(rows: (typeof instructorAvailabilityTable.$inferSelect)[], date: string, startTime: string, endTime: string) {
  return instructorCapacityForSlot(rows, date, startTime, endTime) != null;
}

async function instructorForUser(userId: number) {
  const [inst] = await db.select().from(instructorsTable).where(eq(instructorsTable.userId, userId)).limit(1);
  return inst || null;
}

// Resolve the instructor profile for a logged-in account. The user's CURRENT role is read
// from the DB (NOT the JWT), so a member just promoted to "instructor" via the role dropdown
// can use the instructor system immediately — without logging out and back in for a fresh
// token. (It also denies anyone since demoted out of the role, even if a stale token says
// otherwise.) If they hold the instructor role but have no linked profile yet, link an
// existing record by email or create one. Returns null for anyone not currently an instructor.
async function ensureInstructorForUser(userId: number) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u || u.role !== "instructor") return null;

  const linked = await instructorForUser(userId);
  if (linked) return linked;

  // Reuse an admin-created instructor record with the same email; otherwise create a fresh one.
  // users.email is nullable, but instructors.email is required + unique — so only match by
  // email when the account has one, and fall back to a unique placeholder on create.
  const [byEmail] = u.email
    ? await db.select().from(instructorsTable).where(eq(instructorsTable.email, u.email)).limit(1)
    : [];
  if (byEmail) {
    const [updated] = await db.update(instructorsTable).set({ userId }).where(eq(instructorsTable.id, byEmail.id)).returning();
    return updated;
  }
  const [created] = await db.insert(instructorsTable).values({
    firstName: u.firstName, lastName: u.lastName, phone: u.phone ?? "-",
    email: u.email ?? `instructor-${userId}@aquarich.local`,
    specialty: "ครูฝึก", status: "active", userId, branchId: u.branchId ?? 1,
  }).returning();
  return created;
}

// GET /instructors — authenticated
router.get("/", authenticate, attachBranch, async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    const where = and(
      branchEq(req, instructorsTable.branchId),
      status ? eq(instructorsTable.status, status as "active" | "on_leave" | "inactive")
        : search ? or(ilike(instructorsTable.firstName, `%${search}%`), ilike(instructorsTable.lastName, `%${search}%`), ilike(instructorsTable.specialty, `%${search}%`))
        : undefined
    );

    const instructors = await db.select().from(instructorsTable).where(where).orderBy(instructorsTable.firstName);
    const date = String(req.query.date || "");
    const startTime = String(req.query.startTime || "");
    const endTime = String(req.query.endTime || "");
    if (!date && !startTime && !endTime) return res.json(instructors);
    if (!DATE_RE.test(date) || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || timeMinutes(startTime) >= timeMinutes(endTime))
      return res.status(400).json({ error: "date, startTime และ endTime ไม่ถูกต้อง" });
    if (!instructors.length) return res.json([]);
    const rows = await db.select().from(instructorAvailabilityTable)
      .where(inArray(instructorAvailabilityTable.instructorId, instructors.map((i) => i.id)));
    const byInstructor = new Map<number, typeof rows>();
    for (const row of rows) byInstructor.set(row.instructorId, [...(byInstructor.get(row.instructorId) || []), row]);
    const reservations = await db.select().from(reservationsTable).where(and(
      eq(reservationsTable.date, date),
      inArray(reservationsTable.status, ["confirmed", "pending"]),
      isNotNull(reservationsTable.instructorId),
      branchEq(req, reservationsTable.branchId),
    ));
    const bookedByInstructor = new Map<number, number>();
    for (const row of reservations) {
      if (row.instructorId == null) continue;
      if (!(timeMinutes(startTime) < timeMinutes(row.endTime) && timeMinutes(endTime) > timeMinutes(row.startTime))) continue;
      bookedByInstructor.set(row.instructorId, (bookedByInstructor.get(row.instructorId) || 0) + row.numberOfPeople);
    }
    return res.json(instructors.filter((i) => {
      const capacity = instructorCapacityForSlot(byInstructor.get(i.id) || [], date, startTime, endTime);
      return capacity != null && (bookedByInstructor.get(i.id) || 0) < capacity;
    }));
  } catch {
    return res.status(500).json({ error: "Failed to list instructors" });
  }
});

// GET /instructors/public — active instructors for the public landing page (no auth).
// Curated, non-sensitive columns only (no phone/email). Must stay above "/:id".
router.get("/public", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: instructorsTable.id,
        firstName: instructorsTable.firstName,
        lastName: instructorsTable.lastName,
        specialty: instructorsTable.specialty,
        certification: instructorsTable.certification,
        experience: instructorsTable.experience,
        biography: instructorsTable.biography,
        profileImageUrl: instructorsTable.profileImageUrl,
      })
      .from(instructorsTable)
      .where(eq(instructorsTable.status, "active"))
      .orderBy(instructorsTable.firstName);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to list instructors" });
  }
});

// GET /instructors/today — instructors who have sessions on a date (default: today),
// derived from reservations that have an instructor assigned. Powers the member
// "who is teaching today" view.
router.get("/today", authenticate, async (req, res) => {
  try {
    const date = (req.query.date as string) || bkkDay.format(new Date());

    const rows = await db
      .select()
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.date, date),
          inArray(reservationsTable.status, ["confirmed", "pending"]),
          isNotNull(reservationsTable.instructorId),
        ),
      )
      .orderBy(reservationsTable.startTime);

    const ids = [...new Set(rows.map((r) => r.instructorId).filter((x): x is number => x != null))];
    if (ids.length === 0) return res.json({ date, instructors: [] });

    const instructors = await db.select().from(instructorsTable).where(inArray(instructorsTable.id, ids));
    const byId = Object.fromEntries(instructors.map((i) => [i.id, i]));

    const result = ids
      .filter((id) => byId[id])
      .map((id) => {
        const inst = byId[id];
        const sessions = rows
          .filter((r) => r.instructorId === id)
          .map((r) => ({ startTime: r.startTime, endTime: r.endTime, numberOfPeople: r.numberOfPeople }));
        return {
          id: inst.id,
          firstName: inst.firstName,
          lastName: inst.lastName,
          specialty: inst.specialty,
          certification: inst.certification,
          experience: inst.experience,
          biography: inst.biography,
          profileImageUrl: inst.profileImageUrl,
          status: inst.status,
          sessions,
          sessionCount: sessions.length,
          totalPeople: sessions.reduce((s, x) => s + x.numberOfPeople, 0),
        };
      });

    return res.json({ date, instructors: result });
  } catch {
    return res.status(500).json({ error: "Failed to get today's instructors" });
  }
});

// GET /instructors/teaching?date=YYYY-MM-DD — active instructors and the teaching
// slots they published for that date. Used by the member booking page so members
// choose a teacher first, then pick from that teacher's available teaching times.
router.get("/teaching", authenticate, attachBranch, async (req, res) => {
  try {
    const date = String(req.query.date || "");
    if (!DATE_RE.test(date)) return res.status(400).json({ error: "วันที่ไม่ถูกต้อง" });

    const settings = await getSettings(newRowBranch(req));

    const instructors = await db
      .select()
      .from(instructorsTable)
      .where(and(
        eq(instructorsTable.status, "active"),
        branchEq(req, instructorsTable.branchId),
      ))
      .orderBy(instructorsTable.firstName);
    if (!instructors.length) return res.json([]);

    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const rows = await db
      .select()
      .from(instructorAvailabilityTable)
      .where(inArray(instructorAvailabilityTable.instructorId, instructors.map((i) => i.id)))
      .orderBy(...availOrder);

    const reservations = await db.select().from(reservationsTable).where(and(
      eq(reservationsTable.date, date),
      inArray(reservationsTable.status, ["confirmed", "pending"]),
      isNotNull(reservationsTable.instructorId),
      branchEq(req, reservationsTable.branchId),
    ));

    const applies = (row: typeof instructorAvailabilityTable.$inferSelect) =>
      (row.kind === "date" && row.date === date) || (row.kind === "weekly" && row.dayOfWeek === dayOfWeek);
    const rowCovers = (row: typeof instructorAvailabilityTable.$inferSelect, startTime: string, endTime: string) =>
      timeMinutes(row.startTime) <= timeMinutes(startTime) && timeMinutes(row.endTime) >= timeMinutes(endTime);
    const rowOverlaps = (row: typeof instructorAvailabilityTable.$inferSelect, startTime: string, endTime: string) =>
      timeMinutes(row.startTime) < timeMinutes(endTime) && timeMinutes(row.endTime) > timeMinutes(startTime);
    const reservationOverlaps = (row: typeof reservationsTable.$inferSelect, startTime: string, endTime: string) =>
      timeMinutes(startTime) < timeMinutes(row.endTime) && timeMinutes(endTime) > timeMinutes(row.startTime);

    const result = instructors.map((inst) => {
      const relevant = rows.filter((row) => row.instructorId === inst.id && applies(row));
      const blocked = relevant.filter((row) => !row.isAvailable);
      const slots = [];
      const openMins = timeMinutes(settings.openTime);
      const closeMins = timeMinutes(settings.closeTime);
      const duration = settings.slotDurationMinutes;

      for (let start = openMins; start + duration <= closeMins; start += duration) {
        const startTime = minutesToTime(start);
        const endTime = minutesToTime(start + duration);
        const cover = relevant.find((row) => row.isAvailable && rowCovers(row, startTime, endTime));
        if (!cover) continue;
        if (blocked.some((row) => rowOverlaps(row, startTime, endTime))) continue;

        const bookedPeople = reservations
          .filter((r) => r.instructorId === inst.id && reservationOverlaps(r, startTime, endTime))
          .reduce((sum, r) => sum + r.numberOfPeople, 0);
        const maxPeople = cover.maxPeople ?? DEFAULT_INSTRUCTOR_MAX_PEOPLE_PER_SLOT;
        const remainingPeople = Math.max(0, maxPeople - bookedPeople);
        if (remainingPeople <= 0) continue;

        slots.push({
          id: cover.id,
          kind: cover.kind,
          dayOfWeek: cover.dayOfWeek,
          date: cover.date,
          startTime,
          endTime,
          note: cover.note,
          bookedPeople,
          maxPeople,
          remainingPeople,
        });
      }
      return {
        id: inst.id,
        firstName: inst.firstName,
        lastName: inst.lastName,
        specialty: inst.specialty,
        experience: inst.experience,
        profileImageUrl: inst.profileImageUrl,
        slots,
      };
    }).filter((inst) => inst.slots.length > 0);

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Failed to list teaching instructors" });
  }
});

// ---- instructor self-service (role: instructor) — MUST be before "/:id" ----

// GET /instructors/me — logged-in instructor's own profile
router.get("/me", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile linked to this account" });
    return res.json(inst);
  } catch { return res.status(500).json({ error: "Failed to get profile" }); }
});

// GET /instructors/me/stats — how many sessions this instructor has actually taught
// at the club: confirmed reservations whose date is today or earlier (already occurred).
// Returns lifetime total plus a this-month count for the dashboard.
router.get("/me/stats", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const today = bkkDay.format(new Date());
    const monthStart = today.slice(0, 8) + "01";
    const taught = and(
      eq(reservationsTable.instructorId, inst.id),
      eq(reservationsTable.status, "confirmed"),
      lte(reservationsTable.date, today),
    );
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(reservationsTable).where(taught);
    const [{ thisMonth }] = await db.select({ thisMonth: sql<number>`count(*)::int` })
      .from(reservationsTable).where(and(taught, gte(reservationsTable.date, monthStart)));
    return res.json({ total, thisMonth });
  } catch { return res.status(500).json({ error: "Failed to get stats" }); }
});

// GET /instructors/me/bookings — customers who booked a session with THIS instructor
router.get("/me/bookings", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const today = bkkDay.format(new Date());
    const rows = await db
      .select({
        id: reservationsTable.id, date: reservationsTable.date,
        startTime: reservationsTable.startTime, endTime: reservationsTable.endTime,
        numberOfPeople: reservationsTable.numberOfPeople, status: reservationsTable.status,
        notes: reservationsTable.notes, createdAt: reservationsTable.createdAt,
        memberFirstName: usersTable.firstName, memberLastName: usersTable.lastName,
        memberHouseNumber: usersTable.houseNumber, memberPhone: usersTable.phone,
      })
      .from(reservationsTable)
      .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
      .where(and(
        eq(reservationsTable.instructorId, inst.id),
        gte(reservationsTable.date, today),
        ne(reservationsTable.status, "cancelled"),
      ))
      .orderBy(asc(reservationsTable.date), asc(reservationsTable.startTime));
    return res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch { return res.status(500).json({ error: "Failed to list bookings" }); }
});

// PATCH /instructors/me/bookings/:id — instructor confirms/cancels a booking on THEIR
// own queue (only reservations assigned to this instructor). Mirrors the admin confirm:
// confirming deducts one package use (once), cancelling refunds it.
router.patch("/me/bookings/:id", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Reservation not found" });
    if (existing.instructorId !== inst.id) return res.status(403).json({ error: "คิวนี้ไม่ได้จองกับคุณ" });

    const status = req.body?.status as "confirmed" | "cancelled" | undefined;
    if (status !== undefined && status !== "confirmed" && status !== "cancelled") return res.status(400).json({ error: "status must be confirmed|cancelled" });
    const wantsReschedule = req.body?.date !== undefined || req.body?.startTime !== undefined || req.body?.endTime !== undefined;
    if (!status && !wantsReschedule) return res.status(400).json({ error: "ไม่มีข้อมูลที่ต้องการแก้ไข" });

    const nextDate = wantsReschedule ? String(req.body.date || "") : existing.date;
    const nextStart = wantsReschedule ? String(req.body.startTime || "") : existing.startTime;
    const nextEnd = wantsReschedule ? String(req.body.endTime || "") : existing.endTime;
    if (wantsReschedule) {
      if (existing.status === "cancelled") return res.status(409).json({ error: "คิวนี้ถูกยกเลิกแล้ว" });
      if (!DATE_RE.test(nextDate) || nextDate < bkkDay.format(new Date())) return res.status(400).json({ error: "วันที่ใหม่ไม่ถูกต้องหรือผ่านมาแล้ว" });
      if (!TIME_RE.test(nextStart) || !TIME_RE.test(nextEnd) || timeMinutes(nextStart) >= timeMinutes(nextEnd))
        return res.status(400).json({ error: "ช่วงเวลาใหม่ไม่ถูกต้อง" });
      const [settings] = await db.select().from(settingsTable)
        .where(eq(settingsTable.branchId, existing.branchId ?? 1)).limit(1);
      if (settings) {
        const open = timeMinutes(settings.openTime), close = timeMinutes(settings.closeTime);
        const start = timeMinutes(nextStart), end = timeMinutes(nextEnd);
        if (start < open || end > close || end - start !== settings.slotDurationMinutes || (start - open) % settings.slotDurationMinutes !== 0)
          return res.status(400).json({ error: "เวลาใหม่ไม่ตรงกับรอบเปิดให้จอง" });
        const max = new Date(); max.setDate(max.getDate() + settings.maxAdvanceDays);
        if (nextDate > bkkDay.format(max)) return res.status(400).json({ error: `เปลี่ยนคิวล่วงหน้าได้ไม่เกิน ${settings.maxAdvanceDays} วัน` });
        const others = await db.select().from(reservationsTable).where(and(
          eq(reservationsTable.date, nextDate), inArray(reservationsTable.status, ["confirmed", "pending"]),
          eq(reservationsTable.branchId, existing.branchId ?? 1),
        ));
        const overlapping = others.filter((row) => row.id !== id && timeMinutes(nextStart) < timeMinutes(row.endTime) && timeMinutes(nextEnd) > timeMinutes(row.startTime));
        const instructorOccupied = overlapping
          .filter((row) => row.instructorId === inst.id)
          .reduce((sum, row) => sum + row.numberOfPeople, 0);
        const availabilityRows = await db.select().from(instructorAvailabilityTable).where(eq(instructorAvailabilityTable.instructorId, inst.id));
        const instructorCapacity = instructorCapacityForSlot(availabilityRows, nextDate, nextStart, nextEnd);
        if (instructorCapacity == null) return res.status(409).json({ error: "ครูฝึกไม่ได้ลงเวลาว่างในรอบใหม่นี้" });
        if (instructorOccupied + existing.numberOfPeople > instructorCapacity)
          return res.status(409).json({ error: `ครูฝึกรับสอนได้ไม่เกิน ${instructorCapacity} คนต่อรอบ ช่วงเวลานี้เหลือรับได้ ${Math.max(0, instructorCapacity - instructorOccupied)} คน` });
      }
      // Rescheduling an existing appointment is an explicit commitment by the
      // instructor, so it does not require a separate availability row first.
      // Availability remains the gate for NEW customer bookings only.
    }

    let remainingAfter: number | null = null;
    try {
      const updated = await db.transaction(async (tx) => {
        // Re-read the row under a lock so a simultaneous admin confirm (PATCH /reservations/:id)
        // can't slip between our read and write and double-deduct the member's package. All
        // confirm/cancel decisions below use this fresh, locked copy — never the stale pre-read.
        const [fresh] = await tx.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1).for("update");
        if (!fresh) return null;
        const confirming = status === "confirmed" && fresh.status !== "confirmed";
        const cancelling = status === "cancelled" && fresh.status !== "cancelled";
        if (!confirming && !cancelling && !wantsReschedule) return fresh; // already in the requested state — no-op

        const updates: Partial<typeof reservationsTable.$inferInsert> = {};
        if (status) updates.status = status;
        if (wantsReschedule) { updates.date = nextDate; updates.startTime = nextStart; updates.endTime = nextEnd; }
        // Deduct once on confirm (guarded by memberPackageId so it can't double-charge).
        if (confirming && !fresh.memberPackageId) {
          const consumed = await consumeUse(tx, fresh.userId, { source: "booking", reservationId: id, note: `ครูฝึกยืนยัน ${fresh.date} ${fresh.startTime}-${fresh.endTime}` });
          updates.memberPackageId = consumed.memberPackageId;
          remainingAfter = consumed.remainingAfter;
        }
        const [u] = await tx.update(reservationsTable).set(updates).where(eq(reservationsTable.id, id)).returning();
        if (cancelling) await refundUseForReservation(tx, id);
        return u;
      });
      if (!updated) return res.status(404).json({ error: "Reservation not found" });
      return res.json({ ...updated, createdAt: updated.createdAt.toISOString(), remainingAfter });
    } catch (e) {
      if (e instanceof NoQuotaError) return res.status(400).json({ error: "สมาชิกไม่มีสิทธิ์การใช้งานเหลือ ยืนยันไม่ได้" });
      throw e;
    }
  } catch { return res.status(500).json({ error: "Failed to update booking" }); }
});

// GET /instructors/me/availability
router.get("/me/availability", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const rows = await db.select().from(instructorAvailabilityTable)
      .where(eq(instructorAvailabilityTable.instructorId, inst.id)).orderBy(...availOrder);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Failed to list availability" }); }
});

// POST /instructors/me/availability — add a weekly or specific-date slot
router.post("/me/availability", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const { kind, dayOfWeek, date, startTime, endTime, note, isAvailable, maxPeople } = req.body;
    const validationError = validateAvailability({ kind, dayOfWeek, date, startTime, endTime });
    if (validationError) return res.status(400).json({ error: validationError });
    const parsedMaxPeople = parseMaxPeople(maxPeople);
    if (parsedMaxPeople == null) return res.status(400).json({ error: `จำนวนผู้เรียนต้องอยู่ระหว่าง 0-${INSTRUCTOR_MAX_PEOPLE_PER_SLOT} คน` });
    const existing = await db.select().from(instructorAvailabilityTable)
      .where(eq(instructorAvailabilityTable.instructorId, inst.id));
    const candidate = { kind, dayOfWeek, date, startTime, endTime };
    if (existing.some((row) => availabilityOverlaps(row, candidate)))
      return res.status(409).json({ error: "ช่วงเวลานี้ซ้อนกับตารางที่มีอยู่แล้ว" });
    const [row] = await db.insert(instructorAvailabilityTable).values({
      instructorId: inst.id, kind,
      dayOfWeek: kind === "weekly" ? Number(dayOfWeek) : null,
      date: kind === "date" ? date : null,
      startTime, endTime, note: note || null, isAvailable: isAvailable === false ? false : true,
      maxPeople: parsedMaxPeople,
    }).returning();
    return res.status(201).json(row);
  } catch { return res.status(500).json({ error: "Failed to add availability" }); }
});

// PATCH /instructors/me/availability/:slotId — edit the instructor's own slot.
router.patch("/me/availability/:slotId", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return res.status(400).json({ error: "Invalid slot id" });
    const [current] = await db.select().from(instructorAvailabilityTable).where(and(
      eq(instructorAvailabilityTable.id, slotId), eq(instructorAvailabilityTable.instructorId, inst.id),
    )).limit(1);
    if (!current) return res.status(404).json({ error: "ไม่พบช่วงเวลานี้" });

    const candidate = {
      kind: req.body.kind ?? current.kind,
      dayOfWeek: req.body.dayOfWeek ?? current.dayOfWeek,
      date: req.body.date ?? current.date,
      startTime: req.body.startTime ?? current.startTime,
      endTime: req.body.endTime ?? current.endTime,
      note: req.body.note !== undefined ? req.body.note : current.note,
      isAvailable: req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : current.isAvailable,
      maxPeople: req.body.maxPeople ?? current.maxPeople,
    };
    const validationError = validateAvailability(candidate);
    if (validationError) return res.status(400).json({ error: validationError });
    const parsedMaxPeople = parseMaxPeople(candidate.maxPeople);
    if (parsedMaxPeople == null) return res.status(400).json({ error: `จำนวนผู้เรียนต้องอยู่ระหว่าง 0-${INSTRUCTOR_MAX_PEOPLE_PER_SLOT} คน` });
    // Existing availability may overlap on the same weekday (for example when a
    // teacher extends 17:00-18:00 to 17:00-19:00 while an 18:00-20:00 row exists).
    // That is safe: these rows advertise availability, not separate bookings.
    // Availability controls which NEW bookings can select the instructor. Existing
    // reservations are appointments in their own right and must not prevent the
    // instructor from changing their future teaching schedule. They stay in the
    // queue until the instructor explicitly reschedules or cancels each booking.

    const [updated] = await db.update(instructorAvailabilityTable).set({
      kind: candidate.kind,
      dayOfWeek: candidate.kind === "weekly" ? Number(candidate.dayOfWeek) : null,
      date: candidate.kind === "date" ? candidate.date : null,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      note: candidate.note || null,
      isAvailable: candidate.isAvailable,
      maxPeople: parsedMaxPeople,
    }).where(and(eq(instructorAvailabilityTable.id, slotId), eq(instructorAvailabilityTable.instructorId, inst.id))).returning();
    return res.json(updated);
  } catch { return res.status(500).json({ error: "Failed to update availability" }); }
});

// DELETE /instructors/me/availability/:slotId
router.delete("/me/availability/:slotId", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const slotId = parseInt(req.params.slotId);
    const allSlots = await db.select().from(instructorAvailabilityTable)
      .where(eq(instructorAvailabilityTable.instructorId, inst.id));
    const current = allSlots.find((row) => row.id === slotId);
    if (!current) return res.status(404).json({ error: "ไม่พบช่วงเวลานี้" });
    // Keep existing appointments intact. Removing availability only stops new
    // customers from choosing this instructor during the removed period.
    const [deleted] = await db.delete(instructorAvailabilityTable).where(and(
      eq(instructorAvailabilityTable.id, slotId),
      eq(instructorAvailabilityTable.instructorId, inst.id))).returning({ id: instructorAvailabilityTable.id });
    if (!deleted) return res.status(404).json({ error: "ไม่พบช่วงเวลานี้" });
    return res.json({ message: "Deleted" });
  } catch { return res.status(500).json({ error: "Failed to delete" }); }
});

// GET /instructors/:id/availability — view an instructor's schedule (display only)
router.get("/:id/availability", authenticate, async (req, res) => {
  try {
    const rows = await db.select().from(instructorAvailabilityTable)
      .where(eq(instructorAvailabilityTable.instructorId, parseInt(req.params.id))).orderBy(...availOrder);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Failed to list availability" }); }
});

// POST /instructors/:id/availability — admin creates a teaching slot for an instructor.
router.post("/:id/availability", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const instructorId = parseInt(req.params.id);
    const [inst] = await db.select().from(instructorsTable).where(and(
      eq(instructorsTable.id, instructorId),
      branchEq(req, instructorsTable.branchId),
    )).limit(1);
    if (!inst) return res.status(404).json({ error: "Instructor not found" });

    const { kind, dayOfWeek, date, startTime, endTime, note, isAvailable, maxPeople } = req.body;
    const validationError = validateAvailability({ kind, dayOfWeek, date, startTime, endTime });
    if (validationError) return res.status(400).json({ error: validationError });
    const parsedMaxPeople = parseMaxPeople(maxPeople);
    if (parsedMaxPeople == null) return res.status(400).json({ error: `จำนวนผู้เรียนต้องอยู่ระหว่าง 0-${INSTRUCTOR_MAX_PEOPLE_PER_SLOT} คน` });

    const [row] = await db.insert(instructorAvailabilityTable).values({
      instructorId,
      kind,
      dayOfWeek: kind === "weekly" ? Number(dayOfWeek) : null,
      date: kind === "date" ? date : null,
      startTime,
      endTime,
      maxPeople: parsedMaxPeople,
      note: note || null,
      isAvailable: isAvailable === false ? false : true,
    }).returning();
    return res.status(201).json(row);
  } catch { return res.status(500).json({ error: "Failed to add availability" }); }
});

// PATCH /instructors/:id/availability/:slotId — admin edits an instructor teaching slot.
router.patch("/:id/availability/:slotId", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const instructorId = parseInt(req.params.id);
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return res.status(400).json({ error: "Invalid slot id" });

    const [inst] = await db.select().from(instructorsTable).where(and(
      eq(instructorsTable.id, instructorId),
      branchEq(req, instructorsTable.branchId),
    )).limit(1);
    if (!inst) return res.status(404).json({ error: "Instructor not found" });

    const [current] = await db.select().from(instructorAvailabilityTable).where(and(
      eq(instructorAvailabilityTable.id, slotId),
      eq(instructorAvailabilityTable.instructorId, instructorId),
    )).limit(1);
    if (!current) return res.status(404).json({ error: "ไม่พบช่วงเวลานี้" });

    const candidate = {
      kind: req.body.kind ?? current.kind,
      dayOfWeek: req.body.dayOfWeek ?? current.dayOfWeek,
      date: req.body.date ?? current.date,
      startTime: req.body.startTime ?? current.startTime,
      endTime: req.body.endTime ?? current.endTime,
      note: req.body.note !== undefined ? req.body.note : current.note,
      isAvailable: req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : current.isAvailable,
      maxPeople: req.body.maxPeople ?? current.maxPeople,
    };
    const validationError = validateAvailability(candidate);
    if (validationError) return res.status(400).json({ error: validationError });
    const parsedMaxPeople = parseMaxPeople(candidate.maxPeople);
    if (parsedMaxPeople == null) return res.status(400).json({ error: `จำนวนผู้เรียนต้องอยู่ระหว่าง 0-${INSTRUCTOR_MAX_PEOPLE_PER_SLOT} คน` });

    const [updated] = await db.update(instructorAvailabilityTable).set({
      kind: candidate.kind,
      dayOfWeek: candidate.kind === "weekly" ? Number(candidate.dayOfWeek) : null,
      date: candidate.kind === "date" ? candidate.date : null,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      maxPeople: parsedMaxPeople,
      note: candidate.note || null,
      isAvailable: candidate.isAvailable,
    }).where(and(
      eq(instructorAvailabilityTable.id, slotId),
      eq(instructorAvailabilityTable.instructorId, instructorId),
    )).returning();
    return res.json(updated);
  } catch { return res.status(500).json({ error: "Failed to update availability" }); }
});

// DELETE /instructors/:id/availability/:slotId — admin removes an instructor teaching slot.
router.delete("/:id/availability/:slotId", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const instructorId = parseInt(req.params.id);
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return res.status(400).json({ error: "Invalid slot id" });

    const [inst] = await db.select().from(instructorsTable).where(and(
      eq(instructorsTable.id, instructorId),
      branchEq(req, instructorsTable.branchId),
    )).limit(1);
    if (!inst) return res.status(404).json({ error: "Instructor not found" });

    const [deleted] = await db.delete(instructorAvailabilityTable).where(and(
      eq(instructorAvailabilityTable.id, slotId),
      eq(instructorAvailabilityTable.instructorId, instructorId),
    )).returning({ id: instructorAvailabilityTable.id });
    if (!deleted) return res.status(404).json({ error: "ไม่พบช่วงเวลานี้" });
    return res.json({ message: "Deleted" });
  } catch { return res.status(500).json({ error: "Failed to delete" }); }
});

// GET /instructors/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const [instructor] = await db.select().from(instructorsTable).where(eq(instructorsTable.id, parseInt(req.params.id))).limit(1);
    if (!instructor) return res.status(404).json({ error: "Instructor not found" });
    return res.json(instructor);
  } catch {
    return res.status(500).json({ error: "Failed to get instructor" });
  }
});

// POST /instructors/:id/account — admin: create + link a login (role=instructor)
router.post("/:id/account", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username and password required" });
    if (String(password).length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });
    const [inst] = await db.select().from(instructorsTable).where(eq(instructorsTable.id, id)).limit(1);
    if (!inst) return res.status(404).json({ error: "Instructor not found" });
    const existing = await db.select().from(usersTable)
      .where(or(eq(usersTable.username, username), eq(usersTable.email, inst.email))).limit(1);
    if (existing.length) return res.status(400).json({ error: "ชื่อผู้ใช้หรืออีเมลนี้มีอยู่แล้ว" });
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({
      firstName: inst.firstName, lastName: inst.lastName, houseNumber: "-",
      phone: inst.phone, email: inst.email, username, passwordHash, role: "instructor",
    }).returning();
    await db.update(instructorsTable).set({ userId: user.id }).where(eq(instructorsTable.id, id));

    // New login code created for an instructor -> set up their personal folder + logs.
    await initMemberFolder(user, "instructor_account");

    return res.status(201).json({ ok: true, userId: user.id, username });
  } catch { return res.status(500).json({ error: "Failed to create instructor account" }); }
});

// POST /instructors — admin only
router.post("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const { firstName, lastName, phone, email, specialty, certification, experience, biography, profileImageUrl, status, userId } = req.body;
    const [instructor] = await db
      .insert(instructorsTable)
      .values({ firstName, lastName, phone, email, specialty, certification, experience, biography, profileImageUrl, status: status || "active", userId: userId ?? null, branchId: newRowBranch(req) })
      .returning();
    return res.status(201).json(instructor);
  } catch {
    return res.status(500).json({ error: "Failed to create instructor" });
  }
});

// POST /instructors/promote — admin: promote a user to instructor in one idempotent step.
// Sets role=instructor FIRST (the rank change) then links/creates their instructor profile
// (reusing the existing row by userId/email — never throws on duplicate, never duplicates rows).
router.post("/promote", authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const specialty = req.body.specialty as string | undefined;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const [u] = await db.update(usersTable).set({ role: "instructor" }).where(eq(usersTable.id, userId)).returning();
    if (!u) return res.status(404).json({ error: "User not found" });
    const inst = await ensureInstructorForUser(u.id); // role set to instructor above; link-by-email or create
    if (inst && specialty) {
      await db.update(instructorsTable).set({ specialty }).where(eq(instructorsTable.id, inst.id));
    }
    return res.json({ ok: true, userId: u.id, role: u.role, instructorId: inst?.id ?? null });
  } catch {
    return res.status(500).json({ error: "Failed to promote to instructor" });
  }
});

// PATCH /instructors/:id — admin only
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates: Partial<typeof instructorsTable.$inferInsert> = {};
    const fields = ["firstName", "lastName", "phone", "email", "specialty", "certification", "experience", "biography", "profileImageUrl", "status"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
    }
    const [instructor] = await db.update(instructorsTable).set(updates).where(eq(instructorsTable.id, id)).returning();
    if (!instructor) return res.status(404).json({ error: "Instructor not found" });
    return res.json(instructor);
  } catch {
    return res.status(500).json({ error: "Failed to update instructor" });
  }
});

// DELETE /instructors/:id — admin only
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await db.delete(instructorsTable).where(eq(instructorsTable.id, parseInt(req.params.id)));
    return res.json({ message: "Instructor deleted" });
  } catch {
    return res.status(500).json({ error: "Failed to delete instructor" });
  }
});

export default router;
