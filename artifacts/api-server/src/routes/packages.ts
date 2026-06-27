import { Router } from "express";
import { db, membershipPackagesTable, memberPackagesTable, walletsTable, transactionsTable, usersTable, packageUsagesTable, reservationsTable, memberPackageEventsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray, ilike, or } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";
import { getOrCreateWallet } from "./wallet.js";
import { getActiveUsages } from "../lib/packageUsage.js";
import { appendMemberLog } from "../lib/memberLog.js";

const router = Router();

// GET /packages/public — active packages for the public landing page (no auth).
// Same shape as the authenticated list; only active packages are exposed.
router.get("/public", async (_req, res) => {
  try {
    const packages = await db
      .select()
      .from(membershipPackagesTable)
      .where(eq(membershipPackagesTable.isActive, true))
      .orderBy(membershipPackagesTable.sortOrder, membershipPackagesTable.price);
    return res.json(packages.map(p => ({ ...p, price: Number(p.price), bookingDiscount: Number(p.bookingDiscount) })));
  } catch {
    return res.status(500).json({ error: "Failed to list packages" });
  }
});

// GET /packages — list active packages (all users)
router.get("/", authenticate, async (req, res) => {
  try {
    const packages = await db
      .select()
      .from(membershipPackagesTable)
      .where(eq(membershipPackagesTable.isActive, true))
      .orderBy(membershipPackagesTable.sortOrder, membershipPackagesTable.price);
    return res.json(packages.map(p => ({ ...p, price: Number(p.price), bookingDiscount: Number(p.bookingDiscount) })));
  } catch {
    return res.status(500).json({ error: "Failed to list packages" });
  }
});

// GET /packages/all — admin: all including inactive
router.get("/all", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const packages = await db.select().from(membershipPackagesTable).where(branchEq(req, membershipPackagesTable.branchId)).orderBy(membershipPackagesTable.sortOrder);
    return res.json(packages.map(p => ({ ...p, price: Number(p.price), bookingDiscount: Number(p.bookingDiscount) })));
  } catch {
    return res.status(500).json({ error: "Failed to list packages" });
  }
});

// GET /packages/admin/special-report?range=day|week|month|all&from=YYYY-MM-DD&to=YYYY-MM-DD
// Package purchase report. Includes member self-purchases and admin-assigned paid packages.
router.get("/admin/special-report", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const range = String(req.query.range || "month");
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (req.query.from) from = new Date(String(req.query.from));
    if (req.query.to) {
      to = new Date(String(req.query.to));
      to.setHours(23, 59, 59, 999);
    }
    if (!from && range === "day") from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!from && range === "week") from = new Date(now.getTime() - 7 * 86400000);
    if (!from && range === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);

    const search = String(req.query.search || "").trim();
    const where = and(
      eq(transactionsTable.type, "package_purchase"),
      eq(transactionsTable.status, "completed"),
      branchEq(req, usersTable.branchId),
      from ? gte(transactionsTable.createdAt, from) : undefined,
      to ? lte(transactionsTable.createdAt, to) : undefined,
      search
        ? or(
            ilike(usersTable.firstName, `%${search}%`),
            ilike(usersTable.lastName, `%${search}%`),
            ilike(usersTable.username, `%${search}%`),
            ilike(usersTable.phone, `%${search}%`),
            ilike(membershipPackagesTable.name, `%${search}%`),
            ilike(transactionsTable.description, `%${search}%`),
          )
        : undefined,
    );

    const rows = await db
      .select({
        transaction: transactionsTable,
        pkg: membershipPackagesTable,
        member: usersTable,
      })
      .from(transactionsTable)
      .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .leftJoin(membershipPackagesTable, eq(transactionsTable.referenceId, membershipPackagesTable.id))
      .where(where)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(5000);

    const totalAmount = rows.reduce((sum, r) => sum + Number(r.transaction.amount || 0), 0);
    return res.json({
      range,
      generatedAt: now.toISOString(),
      totalAmount,
      totalCount: rows.length,
      rows: rows.map(({ transaction, pkg, member }) => ({
        id: transaction.id,
        createdAt: transaction.createdAt.toISOString(),
        transactionId: transaction.id,
        memberId: member.id,
        memberCode: `ART${String(member.id).padStart(5, "0")}`,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        phone: member.phone,
        packageId: pkg?.id ?? transaction.referenceId,
        packageName: pkg?.name ?? transaction.description.replace(/^Admin package:\s*/i, "").replace(/^ซื้อแพ็กเกจ:\s*/i, "").trim(),
        pricePaid: Number(transaction.amount),
        amount: Number(transaction.amount),
        status: transaction.status,
        description: transaction.description,
      })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to build package purchase report" });
  }
});

// POST /packages — admin: create
router.post("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const { name, nameEn, description, descriptionEn, imageUrl, price, durationDays, benefits, benefitsEn, maxBookingsPerMonth, bookingDiscount, sortOrder } = req.body;
    const [pkg] = await db.insert(membershipPackagesTable).values({
      name, nameEn: nameEn || name, description, descriptionEn, imageUrl, price: String(price), durationDays,
      benefits, benefitsEn, maxBookingsPerMonth, bookingDiscount: String(bookingDiscount || 0), sortOrder: sortOrder || 0,
      branchId: newRowBranch(req),
    }).returning();
    return res.status(201).json({ ...pkg, price: Number(pkg.price), bookingDiscount: Number(pkg.bookingDiscount) });
  } catch {
    return res.status(500).json({ error: "Failed to create package" });
  }
});

// PATCH /packages/:id — admin: update
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, nameEn, description, descriptionEn, imageUrl, price, durationDays, benefits, benefitsEn, maxBookingsPerMonth, bookingDiscount, isActive, sortOrder } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (nameEn !== undefined) updates.nameEn = nameEn;
    if (description !== undefined) updates.description = description;
    if (descriptionEn !== undefined) updates.descriptionEn = descriptionEn;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (price !== undefined) updates.price = String(price);
    if (durationDays !== undefined) updates.durationDays = durationDays;
    if (benefits !== undefined) updates.benefits = benefits;
    if (benefitsEn !== undefined) updates.benefitsEn = benefitsEn;
    if (maxBookingsPerMonth !== undefined) updates.maxBookingsPerMonth = maxBookingsPerMonth;
    if (bookingDiscount !== undefined) updates.bookingDiscount = String(bookingDiscount);
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    const [pkg] = await db.update(membershipPackagesTable).set(updates).where(eq(membershipPackagesTable.id, id)).returning();
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    return res.json({ ...pkg, price: Number(pkg.price), bookingDiscount: Number(pkg.bookingDiscount) });
  } catch {
    return res.status(500).json({ error: "Failed to update package" });
  }
});

// DELETE /packages/:id — admin: permanently delete (blocked if members already own it)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.delete(membershipPackagesTable).where(eq(membershipPackagesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Package not found" });
    return res.json({ message: "Package deleted" });
  } catch (err: any) {
    // 23503 = FK violation: a member_packages row still references this package.
    // drizzle wraps the pg error, so the code may be on err.cause.
    if (err?.code === "23503" || err?.cause?.code === "23503") {
      return res.status(409).json({ error: "ลบไม่ได้ เพราะมีสมาชิกซื้อแพ็กเกจนี้แล้ว กรุณาใช้ปุ่มปิดการใช้งานแทน" });
    }
    return res.status(500).json({ error: "Failed to delete package" });
  }
});

// GET /packages/admin/member/:userId — admin: view a member's full course/package history.
router.get("/admin/member/:userId", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const [member] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), branchEq(req, usersTable.branchId)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Member not found" });

    const rows = await db
      .select({ mp: memberPackagesTable, pkg: membershipPackagesTable })
      .from(memberPackagesTable)
      .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
      .where(eq(memberPackagesTable.userId, userId))
      .orderBy(desc(memberPackagesTable.createdAt));

    const now = new Date();
    return res.json(rows.map(({ mp, pkg }) => ({
      ...mp,
      pricePaid: Number(mp.pricePaid),
      startDate: mp.startDate.toISOString(),
      endDate: mp.endDate.toISOString(),
      createdAt: mp.createdAt.toISOString(),
      isExpired: mp.status !== "active" || new Date(mp.endDate) < now,
      package: { ...pkg, price: Number(pkg.price), bookingDiscount: Number(pkg.bookingDiscount) },
    })));
  } catch {
    return res.status(500).json({ error: "Failed to get member packages" });
  }
});

// GET /packages/admin/member/:userId/history — admin: full course timeline.
router.get("/admin/member/:userId/history", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const [member] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), branchEq(req, usersTable.branchId)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Member not found" });

    const packageRows = await db
      .select({ mp: memberPackagesTable, pkg: membershipPackagesTable })
      .from(memberPackagesTable)
      .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
      .where(eq(memberPackagesTable.userId, userId))
      .orderBy(desc(memberPackagesTable.createdAt));

    const memberPackageIds = packageRows.map(({ mp }) => mp.id);
    const usageRows = memberPackageIds.length
      ? await db
          .select({ usage: packageUsagesTable, reservation: reservationsTable })
          .from(packageUsagesTable)
          .leftJoin(reservationsTable, eq(packageUsagesTable.reservationId, reservationsTable.id))
          .where(inArray(packageUsagesTable.memberPackageId, memberPackageIds))
          .orderBy(desc(packageUsagesTable.createdAt))
      : [];

    const eventRows = await db
      .select({ event: memberPackageEventsTable, admin: usersTable })
      .from(memberPackageEventsTable)
      .leftJoin(usersTable, eq(memberPackageEventsTable.adminId, usersTable.id))
      .where(eq(memberPackageEventsTable.userId, userId))
      .orderBy(desc(memberPackageEventsTable.createdAt));

    const now = new Date();
    const packages = packageRows.map(({ mp, pkg }) => ({
      ...mp,
      pricePaid: Number(mp.pricePaid),
      startDate: mp.startDate.toISOString(),
      endDate: mp.endDate.toISOString(),
      createdAt: mp.createdAt.toISOString(),
      isExpired: mp.status !== "active" || new Date(mp.endDate) < now,
      package: { ...pkg, price: Number(pkg.price), bookingDiscount: Number(pkg.bookingDiscount) },
    }));

    const byPackageName = new Map(packageRows.map(({ mp, pkg }) => [mp.id, pkg.name]));
    const usages = usageRows.map(({ usage, reservation }) => ({
      ...usage,
      createdAt: usage.createdAt.toISOString(),
      packageName: byPackageName.get(usage.memberPackageId) ?? "",
      reservation: reservation ? {
        id: reservation.id,
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        status: reservation.status,
        numberOfPeople: reservation.numberOfPeople,
      } : null,
    }));

    const events = eventRows.map(({ event, admin }) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
      before: event.beforeJson ? JSON.parse(event.beforeJson) : null,
      after: event.afterJson ? JSON.parse(event.afterJson) : null,
      admin: admin ? { id: admin.id, firstName: admin.firstName, lastName: admin.lastName, username: admin.username } : null,
    }));

    return res.json({ member: { id: member.id, firstName: member.firstName, lastName: member.lastName, memberCode: `ART${String(member.id).padStart(5, "0")}` }, packages, usages, events });
  } catch {
    return res.status(500).json({ error: "Failed to get member course history" });
  }
});

// POST /packages/admin/assign — admin: add a normal/special/old package to a specific member.
router.post("/admin/assign", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const packageId = Number(req.body.packageId);
    if (!userId || !packageId) return res.status(400).json({ error: "userId and packageId are required" });

    const [member] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), branchEq(req, usersTable.branchId)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Member not found" });

    const [pkg] = await db
      .select()
      .from(membershipPackagesTable)
      .where(and(eq(membershipPackagesTable.id, packageId), branchEq(req, membershipPackagesTable.branchId)))
      .limit(1);
    if (!pkg) return res.status(404).json({ error: "Package not found" });

    const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();
    const endDate = req.body.endDate ? new Date(req.body.endDate) : new Date(startDate);
    if (!req.body.endDate) endDate.setDate(endDate.getDate() + pkg.durationDays);
    const pricePaid = req.body.pricePaid !== undefined && req.body.pricePaid !== "" ? Number(req.body.pricePaid) : Number(pkg.price);
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";

    const [mp] = await db.insert(memberPackagesTable).values({
      userId,
      packageId,
      pricePaid: String(Math.max(0, pricePaid || 0)),
      startDate,
      endDate,
      status: "active",
      branchId: member.branchId ?? newRowBranch(req),
    }).returning();

    await db.insert(memberPackageEventsTable).values({
      userId,
      memberPackageId: mp.id,
      adminId: req.user!.userId,
      eventType: "assigned",
      note: note || "เติมคอร์สโดยแอดมิน",
      afterJson: JSON.stringify({
        packageId,
        packageName: pkg.name,
        pricePaid: Number(mp.pricePaid),
        status: mp.status,
        startDate: mp.startDate.toISOString(),
        endDate: mp.endDate.toISOString(),
        bookingsUsed: mp.bookingsUsed,
      }),
      branchId: member.branchId ?? newRowBranch(req),
    });

    if (pricePaid > 0) {
      await db.insert(transactionsTable).values({
        userId,
        amount: String(pricePaid),
        type: "package_purchase",
        description: `Admin package: ${pkg.name}${note ? ` (${note})` : ""}`,
        status: "completed",
        referenceId: packageId,
        branchId: member.branchId ?? newRowBranch(req),
      });
    }

    await appendMemberLog({ userId }, "activity", {
      action: "admin_assign_package",
      packageName: pkg.name,
      pricePaid,
      note,
    });

    return res.status(201).json({
      ...mp,
      pricePaid: Number(mp.pricePaid),
      startDate: mp.startDate.toISOString(),
      endDate: mp.endDate.toISOString(),
      createdAt: mp.createdAt.toISOString(),
      package: { ...pkg, price: Number(pkg.price), bookingDiscount: Number(pkg.bookingDiscount) },
    });
  } catch {
    return res.status(500).json({ error: "Failed to assign package" });
  }
});

// PATCH /packages/admin/member-packages/:id — admin: adjust old course balance/status/date.
router.patch("/admin/member-packages/:id", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db
      .select({ mp: memberPackagesTable, member: usersTable })
      .from(memberPackagesTable)
      .innerJoin(usersTable, eq(memberPackagesTable.userId, usersTable.id))
      .where(and(eq(memberPackagesTable.id, id), branchEq(req, usersTable.branchId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Member package not found" });

    const updates: Partial<typeof memberPackagesTable.$inferInsert> = {};
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.bookingsUsed !== undefined) updates.bookingsUsed = Math.max(0, Number(req.body.bookingsUsed) || 0);
    if (req.body.pricePaid !== undefined) updates.pricePaid = String(Math.max(0, Number(req.body.pricePaid) || 0));
    if (req.body.startDate) updates.startDate = new Date(req.body.startDate);
    if (req.body.endDate) updates.endDate = new Date(req.body.endDate);

    const [mp] = await db.update(memberPackagesTable).set(updates).where(eq(memberPackagesTable.id, id)).returning();
    await db.insert(memberPackageEventsTable).values({
      userId: row.mp.userId,
      memberPackageId: id,
      adminId: req.user!.userId,
      eventType: "updated",
      note: typeof req.body.note === "string" ? req.body.note.slice(0, 500) : "แก้ไขคอร์สโดยแอดมิน",
      beforeJson: JSON.stringify({
        status: row.mp.status,
        bookingsUsed: row.mp.bookingsUsed,
        pricePaid: Number(row.mp.pricePaid),
        startDate: row.mp.startDate.toISOString(),
        endDate: row.mp.endDate.toISOString(),
      }),
      afterJson: JSON.stringify({
        status: mp.status,
        bookingsUsed: mp.bookingsUsed,
        pricePaid: Number(mp.pricePaid),
        startDate: mp.startDate.toISOString(),
        endDate: mp.endDate.toISOString(),
      }),
      branchId: row.member.branchId ?? newRowBranch(req),
    });
    await appendMemberLog({ userId: row.mp.userId }, "activity", {
      action: "admin_update_member_package",
      memberPackageId: id,
      updates,
    });

    return res.json({
      ...mp,
      pricePaid: Number(mp.pricePaid),
      startDate: mp.startDate.toISOString(),
      endDate: mp.endDate.toISOString(),
      createdAt: mp.createdAt.toISOString(),
    });
  } catch {
    return res.status(500).json({ error: "Failed to update member package" });
  }
});

// GET /packages/my — member: my active packages
router.get("/my", authenticate, async (req, res) => {
  try {
    const now = new Date();
    const myPackages = await db
      .select({ mp: memberPackagesTable, pkg: membershipPackagesTable })
      .from(memberPackagesTable)
      .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
      .where(and(eq(memberPackagesTable.userId, req.user!.userId), sql`${memberPackagesTable.status} <> 'cancelled'`))
      .orderBy(desc(memberPackagesTable.createdAt));

    return res.json(myPackages.map(({ mp, pkg }) => ({
      ...mp,
      pricePaid: Number(mp.pricePaid),
      startDate: mp.startDate.toISOString(),
      endDate: mp.endDate.toISOString(),
      createdAt: mp.createdAt.toISOString(),
      isExpired: new Date(mp.endDate) < now,
      package: { ...pkg, price: Number(pkg.price), bookingDiscount: Number(pkg.bookingDiscount) },
    })));
  } catch {
    return res.status(500).json({ error: "Failed to get my packages" });
  }
});

// GET /packages/my-usage — member: active packages with remaining quota (uses left)
router.get("/my-usage", authenticate, async (req, res) => {
  try {
    const usages = await getActiveUsages(db, req.user!.userId);
    const hasUnlimited = usages.some((u) => u.remaining === null);
    const totalRemaining = hasUnlimited ? null : usages.reduce((s, u) => s + (u.remaining ?? 0), 0);
    // Best booking discount across active packages (สิทธิ์ส่วนลดที่ดีที่สุด)
    const bestDiscount = usages.reduce((max, u) => Math.max(max, Number(u.package.bookingDiscount) || 0), 0);
    // Unique benefit lines aggregated across all active packages (สิทธิพิเศษสมาชิก)
    const benefits = [
      ...new Set(
        usages
          .flatMap((u) => (u.package.benefits ?? "").split("\n"))
          .map((b) => b.trim())
          .filter(Boolean),
      ),
    ];
    return res.json({
      hasActivePackage: usages.length > 0,
      hasQuota: usages.some((u) => u.remaining === null || u.remaining > 0),
      totalRemaining,
      bestDiscount,
      benefits,
      packages: usages.map((u) => ({
        memberPackageId: u.memberPackage.id,
        packageId: u.package.id,
        name: u.package.name,
        endDate: u.memberPackage.endDate.toISOString(),
        quota: u.quota,
        used: u.used,
        remaining: u.remaining,
        bookingDiscount: Number(u.package.bookingDiscount) || 0,
        benefits: (u.package.benefits ?? "").split("\n").map((b) => b.trim()).filter(Boolean),
      })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to get usage" });
  }
});

// POST /packages/:id/purchase — member: buy package
router.post("/:id/purchase", authenticate, attachBranch, async (req, res) => {
  try {
    const packageId = parseInt(req.params.id);
    const [pkg] = await db.select().from(membershipPackagesTable).where(eq(membershipPackagesTable.id, packageId)).limit(1);
    if (!pkg || !pkg.isActive) return res.status(404).json({ error: "Package not found" });

    const price = Number(pkg.price);
    const wallet = await getOrCreateWallet(req.user!.userId);
    if (Number(wallet.balance) < price) {
      return res.status(400).json({ error: "ยอดเงินในกระเป๋าไม่เพียงพอ", required: price, balance: Number(wallet.balance) });
    }

    const newBalance = Number(wallet.balance) - price;
    await db.update(walletsTable).set({ balance: String(newBalance), updatedAt: new Date() }).where(eq(walletsTable.userId, req.user!.userId));

    await db.insert(transactionsTable).values({
      userId: req.user!.userId,
      amount: String(price),
      type: "package_purchase",
      description: `ซื้อแพ็กเกจ: ${pkg.name}`,
      status: "completed",
      referenceId: packageId,
      branchId: newRowBranch(req),
    });

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + pkg.durationDays);

    const [mp] = await db.insert(memberPackagesTable).values({
      userId: req.user!.userId,
      packageId,
      pricePaid: String(price),
      endDate,
      branchId: newRowBranch(req),
    }).returning();

    await appendMemberLog({ userId: req.user!.userId }, "activity", {
      action: "package_purchase", packageName: pkg.name, price,
    });

    return res.status(201).json({ ...mp, pricePaid: Number(mp.pricePaid), startDate: mp.startDate.toISOString(), endDate: mp.endDate.toISOString(), createdAt: mp.createdAt.toISOString(), package: { ...pkg, price: Number(pkg.price) } });
  } catch {
    return res.status(500).json({ error: "Failed to purchase package" });
  }
});

export default router;
