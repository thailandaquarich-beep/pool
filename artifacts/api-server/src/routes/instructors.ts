import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, instructorsTable, reservationsTable, instructorAvailabilityTable, usersTable } from "@workspace/db";
import { eq, ilike, or, sql, and, inArray, isNotNull, asc, gte, ne } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { consumeUse, refundUseForReservation, NoQuotaError } from "../lib/packageUsage.js";

const router = Router();

const availOrder = [
  asc(instructorAvailabilityTable.kind), asc(instructorAvailabilityTable.dayOfWeek),
  asc(instructorAvailabilityTable.date), asc(instructorAvailabilityTable.startTime),
] as const;

async function instructorForUser(userId: number) {
  const [inst] = await db.select().from(instructorsTable).where(eq(instructorsTable.userId, userId)).limit(1);
  return inst || null;
}

// Find the instructor profile linked to this account; if the user has the "instructor"
// role but no linked profile yet (e.g. promoted via the role dropdown), link an existing
// record by email or create one. Guarantees any instructor-rank user can schedule.
async function ensureInstructorForUser(userId: number, role?: string) {
  const linked = await instructorForUser(userId);
  if (linked) return linked;
  if (role !== "instructor") return null;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return null;
  const [byEmail] = await db.select().from(instructorsTable).where(eq(instructorsTable.email, u.email)).limit(1);
  if (byEmail) {
    const [updated] = await db.update(instructorsTable).set({ userId }).where(eq(instructorsTable.id, byEmail.id)).returning();
    return updated;
  }
  const [created] = await db.insert(instructorsTable).values({
    firstName: u.firstName, lastName: u.lastName, phone: u.phone, email: u.email,
    specialty: "ครูฝึก", status: "active", userId,
  }).returning();
  return created;
}

// GET /instructors — authenticated
router.get("/", authenticate, async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    let query = db.select().from(instructorsTable);
    if (status) {
      query = query.where(eq(instructorsTable.status, status as "active" | "on_leave" | "inactive")) as typeof query;
    } else if (search) {
      query = query.where(
        or(ilike(instructorsTable.firstName, `%${search}%`), ilike(instructorsTable.lastName, `%${search}%`), ilike(instructorsTable.specialty, `%${search}%`))
      ) as typeof query;
    }

    const instructors = await query.orderBy(instructorsTable.firstName);
    return res.json(instructors);
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
    const inst = await ensureInstructorForUser(req.user!.userId, req.user!.role);
    if (!inst) return res.status(404).json({ error: "No instructor profile linked to this account" });
    return res.json(inst);
  } catch { return res.status(500).json({ error: "Failed to get profile" }); }
});

// GET /instructors/me/bookings — customers who booked a session with THIS instructor
router.get("/me/bookings", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId, req.user!.role);
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
    const inst = await ensureInstructorForUser(req.user!.userId, req.user!.role);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Reservation not found" });
    if (existing.instructorId !== inst.id) return res.status(403).json({ error: "คิวนี้ไม่ได้จองกับคุณ" });

    const status = req.body?.status;
    if (status !== "confirmed" && status !== "cancelled") return res.status(400).json({ error: "status must be confirmed|cancelled" });

    const isConfirming = status === "confirmed" && existing.status !== "confirmed";
    const isCancelling = status === "cancelled" && existing.status !== "cancelled";
    if (!isConfirming && !isCancelling) return res.json({ ...existing, createdAt: existing.createdAt.toISOString(), remainingAfter: null });

    let remainingAfter: number | null = null;
    try {
      const updated = await db.transaction(async (tx) => {
        const updates: Partial<typeof reservationsTable.$inferInsert> = { status };
        // Deduct once on confirm (guarded by memberPackageId so it can't double-charge).
        if (isConfirming && !existing.memberPackageId) {
          const consumed = await consumeUse(tx, existing.userId, { source: "booking", reservationId: id, note: `ครูฝึกยืนยัน ${existing.date} ${existing.startTime}-${existing.endTime}` });
          updates.memberPackageId = consumed.memberPackageId;
          remainingAfter = consumed.remainingAfter;
        }
        const [u] = await tx.update(reservationsTable).set(updates).where(eq(reservationsTable.id, id)).returning();
        if (isCancelling) await refundUseForReservation(tx, id);
        return u;
      });
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
    const inst = await ensureInstructorForUser(req.user!.userId, req.user!.role);
    if (!inst) return res.status(404).json({ error: "No instructor profile" });
    const rows = await db.select().from(instructorAvailabilityTable)
      .where(eq(instructorAvailabilityTable.instructorId, inst.id)).orderBy(...availOrder);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Failed to list availability" }); }
});

// POST /instructors/me/availability — add a weekly or specific-date slot
router.post("/me/availability", authenticate, async (req, res) => {
  try {
    const inst = await ensureInstructorForUser(req.user!.userId, req.user!.role);
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
    const inst = await ensureInstructorForUser(req.user!.userId, req.user!.role);
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
    return res.status(201).json({ ok: true, userId: user.id, username });
  } catch { return res.status(500).json({ error: "Failed to create instructor account" }); }
});

// POST /instructors — admin only
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, phone, email, specialty, certification, experience, biography, profileImageUrl, status, userId } = req.body;
    const [instructor] = await db
      .insert(instructorsTable)
      .values({ firstName, lastName, phone, email, specialty, certification, experience, biography, profileImageUrl, status: status || "active", userId: userId ?? null })
      .returning();
    return res.status(201).json(instructor);
  } catch {
    return res.status(500).json({ error: "Failed to create instructor" });
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
