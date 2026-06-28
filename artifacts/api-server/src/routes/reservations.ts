import { Router } from "express";
import { db, reservationsTable, usersTable, settingsTable, instructorsTable, instructorAvailabilityTable, memberPackagesTable, membershipPackagesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, or, inArray, asc, desc } from "drizzle-orm";
import { authenticate, requireAdmin, isAdminRole } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";
import { consumeUse, refundUseForReservation, getActiveUsages, NoQuotaError } from "../lib/packageUsage.js";
import { logUsage } from "../lib/usageLog.js";
import { memberCode } from "../lib/memberCode.js";
import { appendMemberLog } from "../lib/memberLog.js";
import { bangkokDate, bangkokDateAfter, isIsoDate } from "../lib/date.js";
import { sendMail } from "../lib/mailer.js";

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

type ReservationPackage = {
  memberPackageId: number;
  packageId: number;
  name: string;
  nameEn: string;
  status: string;
  startDate: string;
  endDate: string;
  bookingsUsed: number;
};

async function getReservationPackagesMap(rows: (typeof reservationsTable.$inferSelect)[]) {
  const ids = [...new Set(rows.map((r) => r.memberPackageId).filter((id): id is number => id != null))];
  if (ids.length === 0) return {} as Record<number, ReservationPackage>;
  const data = await db
    .select({ mp: memberPackagesTable, pkg: membershipPackagesTable })
    .from(memberPackagesTable)
    .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
    .where(inArray(memberPackagesTable.id, ids));
  return Object.fromEntries(data.map(({ mp, pkg }) => [
    mp.id,
    {
      memberPackageId: mp.id,
      packageId: pkg.id,
      name: pkg.name,
      nameEn: pkg.nameEn,
      status: mp.status,
      startDate: mp.startDate.toISOString(),
      endDate: mp.endDate.toISOString(),
      bookingsUsed: mp.bookingsUsed,
    },
  ])) as Record<number, ReservationPackage>;
}

function formatReservation(
  r: typeof reservationsTable.$inferSelect,
  user: typeof usersTable.$inferSelect,
  instructor?: InstructorRow | null,
  packageInfo?: ReservationPackage | null,
) {
  const { passwordHash: _, ...safeUser } = user;
  return {
    ...r,
    date: r.date,
    price: Number(r.price),
    createdAt: r.createdAt.toISOString(),
    user: { ...safeUser, createdAt: safeUser.createdAt.toISOString() },
    instructor: publicInstructor(instructor),
    package: packageInfo ?? null,
  };
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string) {
  return timeToMinutes(s1) < timeToMinutes(e2) && timeToMinutes(e1) > timeToMinutes(s2);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_INSTRUCTOR_MAX_PEOPLE_PER_SLOT = 5;
const INSTRUCTOR_MAX_PEOPLE_PER_SLOT = 99;

async function instructorCapacityForSlot(instructorId: number, date: string, startTime: string, endTime: string) {
  const rows = await db.select().from(instructorAvailabilityTable)
    .where(eq(instructorAvailabilityTable.instructorId, instructorId));
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const applies = (row: typeof instructorAvailabilityTable.$inferSelect) =>
    (row.kind === "date" && row.date === date) || (row.kind === "weekly" && row.dayOfWeek === dayOfWeek);
  const relevant = rows.filter(applies);
  if (relevant.some((row) => !row.isAvailable && timesOverlap(startTime, endTime, row.startTime, row.endTime))) return null;
  const available = relevant.filter((row) => row.isAvailable && timeToMinutes(row.startTime) <= timeToMinutes(startTime) && timeToMinutes(row.endTime) >= timeToMinutes(endTime));
  if (!available.length) return null;
  return Math.max(...available.map((row) => row.maxPeople ?? DEFAULT_INSTRUCTOR_MAX_PEOPLE_PER_SLOT));
}

async function instructorAvailabilityForSlot(instructorId: number, date: string, startTime: string, endTime: string) {
  const rows = await db.select().from(instructorAvailabilityTable)
    .where(eq(instructorAvailabilityTable.instructorId, instructorId));
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const applies = (row: typeof instructorAvailabilityTable.$inferSelect) =>
    (row.kind === "date" && row.date === date) || (row.kind === "weekly" && row.dayOfWeek === dayOfWeek);
  const relevant = rows.filter(applies);
  if (relevant.some((row) => !row.isAvailable && timesOverlap(startTime, endTime, row.startTime, row.endTime))) return null;
  return relevant
    .filter((row) => row.isAvailable && timeToMinutes(row.startTime) <= timeToMinutes(startTime) && timeToMinutes(row.endTime) >= timeToMinutes(endTime))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "date" ? -1 : 1))[0] ?? null;
}

async function instructorPeopleInSlot(
  instructorId: number,
  date: string,
  startTime: string,
  endTime: string,
  excludeReservationId?: number,
) {
  const rows = await db
    .select()
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.instructorId, instructorId),
        eq(reservationsTable.date, date),
        inArray(reservationsTable.status, ["confirmed", "pending"]),
      ),
    );
  return rows
    .filter((r) => r.id !== excludeReservationId && timesOverlap(startTime, endTime, r.startTime, r.endTime))
    .reduce((sum, r) => sum + r.numberOfPeople, 0);
}

function notifyInstructorBooking(
  instructor: InstructorRow | null,
  user: typeof usersTable.$inferSelect | undefined,
  reservation: typeof reservationsTable.$inferSelect,
) {
  if (!instructor?.email) return;
  const memberName = user ? `${user.firstName} ${user.lastName}` : `สมาชิก #${reservation.userId}`;
  const subject = `มีคอร์สสอนใหม่ ${reservation.date} ${reservation.startTime}-${reservation.endTime}`;
  const text = [
    `สวัสดีครู ${instructor.firstName} ${instructor.lastName}`,
    "",
    "คุณมีคอร์ส/คิวสอนใหม่:",
    `นักเรียน: ${memberName}`,
    `วันที่: ${reservation.date}`,
    `เวลา: ${reservation.startTime}-${reservation.endTime}`,
    `จำนวนผู้เรียน: ${reservation.numberOfPeople} คน`,
    `สถานะ: ${reservation.status === "confirmed" ? "ยืนยันแล้ว" : "รออนุมัติ"}`,
    reservation.notes ? `หมายเหตุ: ${reservation.notes}` : "",
  ].filter(Boolean).join("\n");
  const html = text.replace(/\n/g, "<br />");
  sendMail({ to: instructor.email, subject, text, html }).catch((err) => {
    console.warn("[mailer] failed to notify instructor booking", err);
  });
}

// Per-branch settings: each branch has its own hours/capacity/maintenance row.
async function getSettings(branchId: number) {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.branchId, branchId)).limit(1);
  if (rows.length > 0) return rows[0];
  const [defaultSettings] = await db.insert(settingsTable).values({ branchId }).returning();
  return defaultSettings;
}

// GET /reservations/available-slots
router.get("/available-slots", authenticate, attachBranch, async (req, res) => {
  try {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ error: "date is required" });

    const settings = await getSettings(newRowBranch(req));
    if (!isIsoDate(date)) return res.status(400).json({ error: "วันที่ไม่ถูกต้อง" });
    if (date < bangkokDate()) return res.status(400).json({ error: "ไม่สามารถเลือกวันที่ผ่านมาแล้ว" });
    if (date > bangkokDateAfter(settings.maxAdvanceDays))
      return res.status(400).json({ error: `จองล่วงหน้าได้ไม่เกิน ${settings.maxAdvanceDays} วัน` });
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
            inArray(reservationsTable.status, ["confirmed", "pending"]),
            branchEq(req, reservationsTable.branchId)
          )
        );

      const overlapping = existingReservations.filter((r) =>
        timesOverlap(startTime, endTime, r.startTime, r.endTime)
      );

      const currentPeople = overlapping.reduce((sum, r) => sum + r.numberOfPeople, 0);

      slots.push({
        startTime,
        endTime,
        available: !settings.maintenanceMode && settings.bookingEnabled,
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
    const packagesMap = await getReservationPackagesMap(reservationsRaw);

    return res.json({
      reservations: reservationsRaw.map((r) => formatReservation(r, user, r.instructorId ? instructorsMap[r.instructorId] : null, r.memberPackageId ? packagesMap[r.memberPackageId] : null)),
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
    const today = bangkokDate();

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
    const packagesMap = await getReservationPackagesMap(reservationsRaw);
    return res.json(reservationsRaw.map((r) => formatReservation(r, user, r.instructorId ? instructorsMap[r.instructorId] : null, r.memberPackageId ? packagesMap[r.memberPackageId] : null)));
  } catch {
    return res.status(500).json({ error: "Failed to get upcoming reservations" });
  }
});

// GET /reservations
router.get("/", authenticate, attachBranch, async (req, res) => {
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
    const sort = req.query.sort === "date_asc" ? "date_asc" : "date_desc";

    if (date) conditions.push(eq(reservationsTable.date, date));
    if (startDate) conditions.push(gte(reservationsTable.date, startDate));
    if (endDate) conditions.push(lte(reservationsTable.date, endDate));
    // status accepts a single value ("cancelled") or a comma list ("confirmed,pending")
    // so dashboard cards like "upcoming" (confirmed + pending) can deep-link exactly.
    if (status) {
      const statuses = String(status).split(",").map((s) => s.trim()).filter(Boolean) as ("confirmed" | "pending" | "cancelled" | "maintenance")[];
      if (statuses.length === 1) conditions.push(eq(reservationsTable.status, statuses[0]));
      else if (statuses.length > 1) conditions.push(inArray(reservationsTable.status, statuses));
    }
    if (userId && isAdminRole(req.user!.role)) conditions.push(eq(reservationsTable.userId, userId));

    const whereClause = and(branchEq(req, reservationsTable.branchId), ...conditions);

    const reservationsRaw = await db
      .select()
      .from(reservationsTable)
      .where(whereClause)
      .orderBy(
        sort === "date_asc" ? asc(reservationsTable.date) : desc(reservationsTable.date),
        sort === "date_asc" ? asc(reservationsTable.startTime) : desc(reservationsTable.startTime),
      )
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
    const packagesMap = await getReservationPackagesMap(reservationsRaw);

    return res.json({
      reservations: reservationsRaw.map((r) => formatReservation(r, usersMap[r.userId], r.instructorId ? instructorsMap[r.instructorId] : null, r.memberPackageId ? packagesMap[r.memberPackageId] : null)),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list reservations" });
  }
});

// POST /reservations
router.post("/", authenticate, attachBranch, async (req, res) => {
  try {
    const { date, startTime, endTime, numberOfPeople, notes, instructorId, memberPackageId } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: "date, startTime และ endTime จำเป็นต้องระบุ" });
    }
    const settings = await getSettings(newRowBranch(req));
    if (!isIsoDate(date)) return res.status(400).json({ error: "วันที่ไม่ถูกต้อง" });
    if (!TIME_RE.test(String(startTime)) || !TIME_RE.test(String(endTime)) || timeToMinutes(startTime) >= timeToMinutes(endTime))
      return res.status(400).json({ error: "ช่วงเวลาไม่ถูกต้อง" });
    const people = Number(numberOfPeople);
    const maxPeopleAllowed = instructorId != null ? INSTRUCTOR_MAX_PEOPLE_PER_SLOT : settings.maxPeoplePerSlot;
    if (!Number.isInteger(people) || people < 1 || people > maxPeopleAllowed)
      return res.status(400).json({ error: `จำนวนผู้ใช้ต้องอยู่ระหว่าง 1-${maxPeopleAllowed} คน` });
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const openMinutes = timeToMinutes(settings.openTime);
    const closeMinutes = timeToMinutes(settings.closeTime);
    if (startMinutes < openMinutes || endMinutes > closeMinutes || endMinutes - startMinutes !== settings.slotDurationMinutes || (startMinutes - openMinutes) % settings.slotDurationMinutes !== 0)
      return res.status(400).json({ error: "เวลาที่เลือกไม่ตรงกับรอบเปิดให้จอง" });

    // Validate the chosen instructor (optional) — must exist and be active.
    let instructor: InstructorRow | null = null;
    if (instructorId != null) {
      const [found] = await db.select().from(instructorsTable).where(and(
        eq(instructorsTable.id, Number(instructorId)), branchEq(req, instructorsTable.branchId),
      )).limit(1);
      if (!found) return res.status(400).json({ error: "Instructor not found" });
      if (found.status !== "active") return res.status(400).json({ error: "Instructor is not available" });
      const instructorCapacity = await instructorCapacityForSlot(found.id, date, startTime, endTime);
      if (instructorCapacity == null)
        return res.status(400).json({ error: "ครูฝึกไม่ได้ลงเวลาว่างในรอบที่เลือก" });
      const instructorBookedPeople = await instructorPeopleInSlot(found.id, date, startTime, endTime);
      if (instructorBookedPeople + people > instructorCapacity) {
        return res.status(400).json({
          error: `ครูฝึกรับสอนได้ไม่เกิน ${instructorCapacity} คนต่อรอบ ช่วงเวลานี้เหลือรับได้ ${Math.max(0, instructorCapacity - instructorBookedPeople)} คน`,
        });
      }
      instructor = found;
    }

    if (!settings.bookingEnabled) {
      return res.status(400).json({ error: "Booking is currently disabled" });
    }
    if (settings.maintenanceMode) {
      return res.status(400).json({ error: settings.maintenanceMessage || "Pool is under maintenance" });
    }

    const today = bangkokDate();
    if (date < today) {
      return res.status(400).json({ error: "Cannot book in the past" });
    }

    const maxDateStr = bangkokDateAfter(settings.maxAdvanceDays);
    if (date > maxDateStr) {
      return res.status(400).json({ error: `Cannot book more than ${settings.maxAdvanceDays} days in advance` });
    }

    const overlapping = await db
      .select()
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.date, date),
          inArray(reservationsTable.status, ["confirmed", "pending"]),
          branchEq(req, reservationsTable.branchId)
        )
      );

    const conflicting = overlapping.filter((r) =>
      timesOverlap(startTime, endTime, r.startTime, r.endTime)
    );
    const currentPeople = conflicting.reduce((sum, r) => sum + r.numberOfPeople, 0);

    if (!instructor && currentPeople + people > settings.maxPeoplePerSlot) {
      return res.status(400).json({ error: "This time slot is full" });
    }

    const userId = req.user!.userId;

    const selectedMemberPackageId = Number(memberPackageId);
    if (!Number.isInteger(selectedMemberPackageId) || selectedMemberPackageId < 1) {
      return res.status(400).json({ error: "กรุณาเลือกแพ็กเกจที่จะใช้จอง", needPackage: true });
    }

    // Must hold the selected ACTIVE (non-expired) package with remaining quota to book.
    // Expired packages are not returned here, so booking with one is rejected.
    const activeUsages = await getActiveUsages(db, userId);
    const selectedUsage = activeUsages.find((u) => u.memberPackage.id === selectedMemberPackageId);
    if (!selectedUsage || selectedUsage.expired || (selectedUsage.remaining !== null && selectedUsage.remaining <= 0)) {
      return res.status(400).json({
        error: "แพ็กเกจที่เลือกใช้ไม่ได้ หมดอายุ หรือจำนวนครั้งคงเหลือหมด กรุณาเลือกแพ็กเกจใหม่",
        needPackage: true,
      });
    }

    if (instructor) {
      const teachingSlot = await instructorAvailabilityForSlot(instructor.id, date, startTime, endTime);
      // The slot may require a course CATEGORY (new) or a specific package (legacy).
      // Category takes precedence: the member's chosen package must be in that category.
      if (teachingSlot?.category) {
        if ((selectedUsage.package.category ?? null) !== teachingSlot.category) {
          return res.status(400).json({
            error: `ช่วงเวลานี้สอนหมวด "${teachingSlot.category}" กรุณาเลือกคอร์สในหมวดนี้`,
            needPackage: true,
          });
        }
      } else if (teachingSlot?.packageId && selectedUsage.package.id !== teachingSlot.packageId) {
        return res.status(400).json({
          error: "คอร์สที่เลือกไม่ตรงกับคอร์สของช่วงเวลาครู กรุณาเลือกคอร์สที่ถูกต้อง",
          needPackage: true,
        });
      }
    }

    // A use is deducted immediately from the package the member selected. If the
    // booking is still pending, the member may cancel and the use is refunded.
    // Once confirmed, members cannot self-cancel from the API.
    const autoConfirm = settings.bookingAutoConfirm === true;

    let reservation: typeof reservationsTable.$inferSelect;
    let remainingAfter: number | null = null;
    try {
      const result = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(reservationsTable)
          .values({ userId, date, startTime, endTime, numberOfPeople: people, instructorId: instructor?.id ?? null, status: autoConfirm ? "confirmed" : "pending", notes, branchId: newRowBranch(req) })
          .returning();

        const consumed = await consumeUse(tx, userId, {
          source: "booking",
          reservationId: r.id,
          memberPackageId: selectedMemberPackageId,
          note: `จอง ${date} ${startTime}-${endTime} ด้วยแพ็กเกจ ${selectedUsage.package.name}`,
        });
        const [r2] = await tx.update(reservationsTable).set({ memberPackageId: consumed.memberPackageId }).where(eq(reservationsTable.id, r.id)).returning();
        return { reservation: r2, remainingAfter: consumed.remainingAfter };
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
    notifyInstructorBooking(instructor, user, reservation);
    if (autoConfirm) {
      await logUsage({
        userId,
        memberCode: memberCode(userId, user?.phone),
        name: user ? `${user.firstName} ${user.lastName}` : undefined,
        source: "booking",
        detail: `จอง (ยืนยันอัตโนมัติ) ${date} ${startTime}-${endTime}`,
      });
    }

    await appendMemberLog({ userId, memberCode: memberCode(userId, user?.phone) }, "activity", {
      action: "booking", date, startTime, endTime, numberOfPeople: people, status: reservation.status,
    });

    return res.status(201).json({
      ...formatReservation(reservation, user, instructor, selectedUsage ? {
        memberPackageId: selectedUsage.memberPackage.id,
        packageId: selectedUsage.package.id,
        name: selectedUsage.package.name,
        nameEn: selectedUsage.package.nameEn,
        status: selectedUsage.memberPackage.status,
        startDate: selectedUsage.memberPackage.startDate.toISOString(),
        endDate: selectedUsage.memberPackage.endDate.toISOString(),
        bookingsUsed: selectedUsage.memberPackage.bookingsUsed + 1,
      } : null),
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
    const packagesMap = await getReservationPackagesMap([reservation]);
    return res.json(formatReservation(reservation, user, reservation.instructorId ? instructorsMap[reservation.instructorId] : null, reservation.memberPackageId ? packagesMap[reservation.memberPackageId] : null));
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

    if (numberOfPeople !== undefined || instructorId !== undefined) {
      const nextPeople = numberOfPeople !== undefined ? Number(numberOfPeople) : existing.numberOfPeople;
      if (!Number.isInteger(nextPeople) || nextPeople < 1) {
        return res.status(400).json({ error: "จำนวนผู้จองไม่ถูกต้อง" });
      }

      const nextInstructorId = instructorId !== undefined
        ? (instructorId === null || instructorId === "" ? null : Number(instructorId))
        : existing.instructorId;
      if (nextInstructorId != null) {
        const [found] = await db.select().from(instructorsTable).where(eq(instructorsTable.id, nextInstructorId)).limit(1);
        if (!found) return res.status(400).json({ error: "Instructor not found" });
        if (found.status !== "active") return res.status(400).json({ error: "Instructor is not available" });
        const instructorCapacity = await instructorCapacityForSlot(found.id, existing.date, existing.startTime, existing.endTime);
        if (instructorCapacity == null) return res.status(400).json({ error: "ครูฝึกไม่ได้ลงเวลาว่างในรอบที่เลือก" });
        const instructorBookedPeople = await instructorPeopleInSlot(
          found.id,
          existing.date,
          existing.startTime,
          existing.endTime,
          existing.id,
        );
        if (instructorBookedPeople + nextPeople > instructorCapacity) {
          return res.status(400).json({
            error: `ครูฝึกรับสอนได้ไม่เกิน ${instructorCapacity} คนต่อรอบ ช่วงเวลานี้เหลือรับได้ ${Math.max(0, instructorCapacity - instructorBookedPeople)} คน`,
          });
        }
      }
      updates.numberOfPeople = nextPeople;
      updates.instructorId = nextInstructorId;
    }

    // Permission gate (admin-only confirm) uses the pre-read row; the authoritative deduction
    // below re-reads the row under a lock so concurrent confirms can't double-charge.
    const wantsConfirm = updates.status === "confirmed" && existing.status !== "confirmed";
    if (wantsConfirm && !isAdminRole(req.user!.role)) {
      return res.status(403).json({ error: "ต้องให้แอดมินยืนยันการจอง" });
    }

    let updated: typeof reservationsTable.$inferSelect | null;
    let didConfirm = false;
    try {
      updated = await db.transaction(async (tx) => {
        // Lock the row and decide from this fresh copy — never the stale pre-read — so a
        // simultaneous instructor confirm (PATCH /me/bookings/:id) can't double-deduct.
        const [fresh] = await tx.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1).for("update");
        if (!fresh) return null;
        const confirming = updates.status === "confirmed" && fresh.status !== "confirmed";
        const cancelling = updates.status === "cancelled" && fresh.status !== "cancelled";
        // On confirm, deduct one use from the member's package (once).
        if (confirming && !fresh.memberPackageId) {
          const consumed = await consumeUse(tx, fresh.userId, { source: "booking", reservationId: id, note: `ยืนยันการจอง ${fresh.date} ${fresh.startTime}-${fresh.endTime}` });
          updates.memberPackageId = consumed.memberPackageId;
        }
        const [u] = await tx.update(reservationsTable).set(updates).where(eq(reservationsTable.id, id)).returning();
        // Cancelling a confirmed booking returns the use to the member.
        if (cancelling) {
          await refundUseForReservation(tx, id);
        }
        didConfirm = confirming;
        return u;
      });
    } catch (err) {
      if (err instanceof NoQuotaError) {
        return res.status(400).json({ error: "สมาชิกไม่มีจำนวนครั้งคงเหลือ ไม่สามารถยืนยันได้", needPackage: true });
      }
      throw err;
    }
    if (!updated) return res.status(404).json({ error: "Reservation not found" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1);
    const instructorsMap = await getInstructorsMap([updated]);
    const updatedInstructor = updated.instructorId ? instructorsMap[updated.instructorId] : null;

    if (didConfirm) {
      await logUsage({
        userId: existing.userId,
        memberCode: memberCode(existing.userId, user?.phone),
        name: user ? `${user.firstName} ${user.lastName}` : undefined,
        source: "booking",
        detail: `ยืนยันการจอง ${existing.date} ${existing.startTime}-${existing.endTime}`,
      });
    }

    if (updatedInstructor && (instructorId !== undefined || didConfirm)) {
      notifyInstructorBooking(updatedInstructor, user, updated);
    }

    const packagesMap = await getReservationPackagesMap([updated]);
    return res.json(formatReservation(updated, user, updatedInstructor, updated.memberPackageId ? packagesMap[updated.memberPackageId] : null));
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
    if (!isAdminRole(req.user!.role) && existing.status !== "pending") {
      return res.status(409).json({ error: "การจองที่สำเร็จแล้วไม่สามารถยกเลิกเองได้ กรุณาติดต่อแอดมิน" });
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
