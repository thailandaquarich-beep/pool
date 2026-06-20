import { Router } from "express";
import { db, reservationsTable, usersTable, settingsTable, instructorsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, or, inArray } from "drizzle-orm";
import { authenticate, requireAdmin, isAdminRole } from "../middlewares/auth.js";
import { consumeUse, refundUseForReservation, hasQuota, NoQuotaError } from "../lib/packageUsage.js";
import { logUsage } from "../lib/usageLog.js";
import { memberCode } from "../lib/memberCode.js";

const router = Router();

type InstructorRow = typeof instructorsTable.$inferSelect;

function publicInstructor(instructor?: InstructorRow | null) {
  if (!instructor) return null;
  return {
    id: instructor.id,
    firstName: instructor.firstName,
    lastName: instructor.lastName,
    specialty: instructor.specialty,
    profileImageUrl: instructor.profileImageUrl,
    status: instructor.status,
  };
}

// Fetch a lookup map of the instructors referenced by the given reservation rows.
async function getInstructorsMap(rows: (typeof reservationsTable.$inferSelect)[]) {
  const ids = [...new Set(rows.map((r) => r.instructorId).filter((id): id is number => id != null))];
  if (ids.length === 0) return {} as Record<number, InstructorRow>;
  const data = await db.select().from(instructorsTable).where(inArray(instructorsTable.id, ids));
  return Object.fromEntries(data.map((i) => [i.id, i])) as Record<number, InstructorRow>;
}

function formatReservation(
  r: typeof reservationsTable.$inferSelect,
  user: typeof usersTable.$inferSelect,
  instructor?: InstructorRow | null,
) {
  const { passwordHash: _, ...safeUser } = user;
  return {
    ...r,
    date: r.date,
    price: Number(r.price),
    createdAt: r.createdAt.toISOString(),
    user: { ...safeUser, createdAt: safeUser.createdAt.toISOString() },
    instructor: publicInstructor(instructor),
  };
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string) {
  return timeToMinutes(s1) < timeToMinutes(e2) && timeToMinutes(e1) > timeToMinutes(s2);
}

async function getSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [defaultSettings] = await db.insert(settingsTable).values({}).returning();
  return defaultSettings;
}

// GET /reservations/available-slots
router.get("/available-slots", authenticate, async (req, res) => {
  try {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ error: "date is required" });

    const settings = await getSettings();
    const openMins = timeToMinutes(settings.openTime);
    const closeMins = timeToMinutes(settings.closeTime);
    const duration = settings.slotDurationMinutes;

    const slots = [];
    for (let start = openMins; start + duration <= closeMins; start += duration) {
      const startTime = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      const endMins = start + duration;
      const endTime = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;

      const existingReservations = await db
        .select()
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.date, date),
            inArray(reservationsTable.status, ["confirmed", "pending"])
          )
        );

      const overlapping = existingReservations.filter((r) =>
        timesOverlap(startTime, endTime, r.startTime, r.endTime)
      );

      const currentPeople = overlapping.reduce((sum, r) => sum + r.numberOfPeople, 0);

      slots.push({
        startTime,
        endTime,
        available: !settings.maintenanceMode && settings.bookingEnabled && currentPeople < settings.maxPeoplePerSlot,
        currentPeople,
        maxPeople: settings.maxPeoplePerSlot,
      });
    }

    return res.json(slots);
  } catch {
    return res.status(500).json({ error: "Failed to get available slots" });
  }
});

// GET /reservations/my
router.get("/my", authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const conditions = [eq(reservationsTable.userId, req.user!.userId)];
    if (status) {
      conditions.push(eq(reservationsTable.status, status as "confirmed" | "pending" | "cancelled" | "maintenance"));
    }

    const reservationsRaw = await db
      .select()
      .from(reservationsTable)
      .where(and(...conditions))
      .orderBy(sql`${reservationsTable.date} DESC, ${reservationsTable.startTime} DESC`)
      .limit(limit)
      .offset(offset);

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    const user = users[0];
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(and(...conditions));

    const instructorsMap = await getInstructorsMap(reservationsRaw);

    return res.json({
      reservations: reservationsRaw.map((r) => formatReservation(r, user, r.instructorId ? instructorsMap[r.instructorId] : null)),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch {
    return res.status(500).json({ error: "Failed to get reservations" });
  }
});

// GET /reservations/upcoming
router.get("/upcoming", authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const reservationsRaw = await db
      .select()
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.userId, req.user!.userId),
          gte(reservationsTable.date, today),
          inArray(reservationsTable.status, ["confirmed", "pending"])
        )
      )
      .orderBy(reservationsTable.date, reservationsTable.startTime)
      .limit(5);

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    const user = users[0];
    const instructorsMap = await getInstructorsMap(reservationsRaw);
    return res.json(reservationsRaw.map((r) => formatReservation(r, user, r.instructorId ? instructorsMap[r.instructorId] : null)));
  } catch {
    return res.status(500).json({ error: "Failed to get upcoming reservations" });
  }
});

// GET /reservations
router.get("/", authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (!isAdminRole(req.user!.role)) {
      conditions.push(eq(reservationsTable.userId, req.user!.userId));
    }

    const date = req.query.date as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const status = req.query.status as string | undefined;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

    if (date) conditions.push(eq(reservationsTable.date, date));
    if (startDate) conditions.push(gte(reservationsTable.date, startDate));
    if (endDate) conditions.push(lte(reservationsTable.date, endDate));
    if (status) conditions.push(eq(reservationsTable.status, status as "confirmed" | "pending" | "cancelled" | "maintenance"));
    if (userId && isAdminRole(req.user!.role)) conditions.push(eq(reservationsTable.userId, userId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const reservationsRaw = await db
      .select()
      .from(reservationsTable)
      .where(whereClause)
      .orderBy(sql`${reservationsTable.date} DESC, ${reservationsTable.startTime} DESC`)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(whereClause);

    const userIds = [...new Set(reservationsRaw.map((r) => r.userId))];
    const usersData = userIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : [];

    const usersMap = Object.fromEntries(usersData.map((u) => [u.id, u]));
    const instructorsMap = await getInstructorsMap(reservationsRaw);

    return res.json({
      reservations: reservationsRaw.map((r) => formatReservation(r, usersMap[r.userId], r.instructorId ? instructorsMap[r.instructorId] : null)),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list reservations" });
  }
});

// POST /reservations
router.post("/", authenticate, async (req, res) => {
  try {
    const { date, startTime, endTime, numberOfPeople, notes, instructorId } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: "date, startTime และ endTime จำเป็นต้องระบุ" });
    }
    const settings = await getSettings();

    // Validate the chosen instructor (optional) — must exist and be active.
    let instructor: InstructorRow | null = null;
    if (instructorId != null) {
      const [found] = await db.select().from(instructorsTable).where(eq(instructorsTable.id, instructorId)).limit(1);
      if (!found) return res.status(400).json({ error: "Instructor not found" });
      if (found.status !== "active") return res.status(400).json({ error: "Instructor is not available" });
      instructor = found;
    }

    if (!settings.bookingEnabled) {
      return res.status(400).json({ error: "Booking is currently disabled" });
    }
    if (settings.maintenanceMode) {
      return res.status(400).json({ error: settings.maintenanceMessage || "Pool is under maintenance" });
    }

    const today = new Date().toISOString().split("T")[0];
    if (date < today) {
      return res.status(400).json({ error: "Cannot book in the past" });
    }

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + settings.maxAdvanceDays);
    const maxDateStr = maxDate.toISOString().split("T")[0];
    if (date > maxDateStr) {
      return res.status(400).json({ error: `Cannot book more than ${settings.maxAdvanceDays} days in advance` });
    }

    const overlapping = await db
      .select()
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.date, date),
          inArray(reservationsTable.status, ["confirmed", "pending"])
        )
      );

    const conflicting = overlapping.filter((r) =>
      timesOverlap(startTime, endTime, r.startTime, r.endTime)
    );
    const currentPeople = conflicting.reduce((sum, r) => sum + r.numberOfPeople, 0);

    if (currentPeople + numberOfPeople > settings.maxPeoplePerSlot) {
      return res.status(400).json({ error: "This time slot is full" });
    }

    const userId = req.user!.userId;

    // Must hold an active package with remaining quota to book.
    if (!(await hasQuota(db, userId))) {
      return res.status(400).json({
        error: "ไม่มีแพ็กเกจที่ใช้ได้ หรือจำนวนครั้งคงเหลือหมด กรุณาซื้อแพ็กเกจ",
        needPackage: true,
      });
    }

    // A use is deducted only when the booking becomes "confirmed" — either now (auto-confirm)
    // or later when an admin confirms a "pending" booking.
    const autoConfirm = settings.bookingAutoConfirm === true;

    let reservation: typeof reservationsTable.$inferSelect;
    let remainingAfter: number | null = null;
    try {
      const result = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(reservationsTable)
          .values({ userId, date, startTime, endTime, numberOfPeople, instructorId: instructor?.id ?? null, status: autoConfirm ? "confirmed" : "pending", notes })
          .returning();

        if (autoConfirm) {
          const consumed = await consumeUse(tx, userId, { source: "booking", reservationId: r.id, note: `จอง ${date} ${startTime}-${endTime}` });
          const [r2] = await tx.update(reservationsTable).set({ memberPackageId: consumed.memberPackageId }).where(eq(reservationsTable.id, r.id)).returning();
          return { reservation: r2, remainingAfter: consumed.remainingAfter };
        }
        return { reservation: r, remainingAfter: null as number | null };
      });
      reservation = result.reservation;
      remainingAfter = result.remainingAfter;
    } catch (err) {
      if (err instanceof NoQuotaError) {
        return res.status(400).json({ error: "จำนวนครั้งคงเหลือหมด กรุณาซื้อแพ็กเกจ", needPackage: true });
      }
      throw err;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (autoConfirm) {
      await logUsage({
        userId,
        memberCode: memberCode(userId),
        name: user ? `${user.firstName} ${user.lastName}` : undefined,
        source: "booking",
        detail: `จอง (ยืนยันอัตโนมัติ) ${date} ${startTime}-${endTime}`,
      });
    }
    return res.status(201).json({
      ...formatReservation(reservation, user, instructor),
      autoConfirmed: autoConfirm,
      remainingAfter,
    });
  } catch {
    return res.status(500).json({ error: "Failed to create reservation" });
  }
});

// GET /reservations/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [reservation] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);

    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    if (!isAdminRole(req.user!.role) && reservation.userId !== req.user!.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, reservation.userId)).limit(1);
    const instructorsMap = await getInstructorsMap([reservation]);
    return res.json(formatReservation(reservation, user, reservation.instructorId ? instructorsMap[reservation.instructorId] : null));
  } catch {
    return res.status(500).json({ error: "Failed to get reservation" });
  }
});

// PATCH /reservations/:id
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);

    if (!existing) return res.status(404).json({ error: "Reservation not found" });
    if (!isAdminRole(req.user!.role) && existing.userId !== req.user!.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { status, notes, numberOfPeople, instructorId } = req.body;
    const updates: Partial<typeof reservationsTable.$inferInsert> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (numberOfPeople) updates.numberOfPeople = numberOfPeople;
    if (instructorId !== undefined) updates.instructorId = instructorId;

    const isConfirming = updates.status === "confirmed" && existing.status !== "confirmed";
    const isCancelling = updates.status === "cancelled" && existing.status !== "cancelled";

    // Confirming a booking (which deducts a use) is an admin-only action.
    if (isConfirming && !isAdminRole(req.user!.role)) {
      return res.status(403).json({ error: "ต้องให้แอดมินยืนยันการจอง" });
    }

    let updated: typeof reservationsTable.$inferSelect;
    try {
      updated = await db.transaction(async (tx) => {
        // On confirm, deduct one use from the member's package (once).
        if (isConfirming && !existing.memberPackageId) {
          const consumed = await consumeUse(tx, existing.userId, { source: "booking", reservationId: id, note: `ยืนยันการจอง ${existing.date} ${existing.startTime}-${existing.endTime}` });
          updates.memberPackageId = consumed.memberPackageId;
        }
        const [u] = await tx.update(reservationsTable).set(updates).where(eq(reservationsTable.id, id)).returning();
        // Cancelling a confirmed booking returns the use to the member.
        if (isCancelling) {
          await refundUseForReservation(tx, id);
        }
        return u;
      });
    } catch (err) {
      if (err instanceof NoQuotaError) {
        return res.status(400).json({ error: "สมาชิกไม่มีจำนวนครั้งคงเหลือ ไม่สามารถยืนยันได้", needPackage: true });
      }
      throw err;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1);
    const instructorsMap = await getInstructorsMap([updated]);

    if (isConfirming) {
      await logUsage({
        userId: existing.userId,
        memberCode: memberCode(existing.userId),
        name: user ? `${user.firstName} ${user.lastName}` : undefined,
        source: "booking",
        detail: `ยืนยันการจอง ${existing.date} ${existing.startTime}-${existing.endTime}`,
      });
    }

    return res.json(formatReservation(updated, user, updated.instructorId ? instructorsMap[updated.instructorId] : null));
  } catch {
    return res.status(500).json({ error: "Failed to update reservation" });
  }
});

// DELETE /reservations/:id
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);

    if (!existing) return res.status(404).json({ error: "Reservation not found" });
    if (!isAdminRole(req.user!.role) && existing.userId !== req.user!.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const wasActive = existing.status !== "cancelled";
    await db.transaction(async (tx) => {
      if (wasActive) {
        await tx.update(reservationsTable).set({ status: "cancelled" }).where(eq(reservationsTable.id, id));
        // Returns the package use if one was deducted (no-op for unconfirmed bookings).
        await refundUseForReservation(tx, id);
      }
    });
    return res.json({ message: "Reservation cancelled", refundedUse: wasActive && existing.status === "confirmed" });
  } catch {
    return res.status(500).json({ error: "Failed to cancel reservation" });
  }
});

export default router;
