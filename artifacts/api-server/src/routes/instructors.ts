import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, instructorsTable, reservationsTable, instructorAvailabilityTable, usersTable } from "@workspace/db";
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
  const [byEmail] = await db.select().from(instructorsTable).where(eq(instructorsTable.email, u.email)).limit(1);
  if (byEmail) {
    const [updated] = await db.update(instructorsTable).set({ userId }).where(eq(instructorsTable.id, byEmail.id)).returning();
    return updated;
  }
  const [created] = await db.insert(instructorsTable).values({
    firstName: u.firstName, lastName: u.lastName, phone: u.phone ?? "-", email: u.email,
    specialty: "ครูฝึก", status: "active", userId,
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
    return res.json(instructors);
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
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

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
    const today = new Date().toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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

    const status = req.body?.status;
    if (status !== "confirmed" && status !== "cancelled") return res.status(400).json({ error: "status must be confirmed|cancelled" });

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
        if (!confirming && !cancelling) return fresh; // already in the requested state — no-op

        const updates: Partial<typeof reservationsTable.$inferInsert> = { status };
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
    const { kind, dayOfWeek, date, startTime, endTime, note, isAvailable } = req.body;
    if (kind !== "weekly" && kind !== "date") return res.status(400).json({ error: "kind must be weekly|date" });
    if (!startTime || !endTime) return res.status(400).json({ error: "startTime/endTime required" });
    if (kind === "weekly" && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6))
      return res.status(400).json({ error: "dayOfWeek (0-6) required for weekly" });
    if (kind === "date" && !date) return res.status(400).json({ error: "date required for kind=date" });
    const [row] = await db.insert(instructorAvailabilityTable).values({
      instructorId: inst.id, kind,
      dayOfWeek: kind === "weekly" ? dayOfWeek : null,
      date: kind === "date" ? date : null,
      startTime, endTime, note: note || null, isAvailable: isAvailable === false ? false : true,
    }).returning();
    return res.status(201).json(row);
  } catch { return res.status(500).json({ error: "Failed to add availability" }); }
});

// DELETE /instructors/me/availability/:slotId
router.delete("/me/availability/:slotId", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    await db.delete(instructorAvailabilityTable).where(and(
      eq(instructorAvailabilityTable.id, parseInt(req.params.slotId)),
      eq(instructorAvailabilityTable.instructorId, inst.id)));
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
