import { Router } from "express";
import { db, membershipPackagesTable, memberPackagesTable, walletsTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { getOrCreateWallet } from "./wallet.js";
import { getActiveUsages } from "../lib/packageUsage.js";

const router = Router();

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
router.get("/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const packages = await db.select().from(membershipPackagesTable).orderBy(membershipPackagesTable.sortOrder);
    return res.json(packages.map(p => ({ ...p, price: Number(p.price), bookingDiscount: Number(p.bookingDiscount) })));
  } catch {
    return res.status(500).json({ error: "Failed to list packages" });
  }
});

// POST /packages — admin: create
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, nameEn, description, descriptionEn, price, durationDays, benefits, benefitsEn, maxBookingsPerMonth, bookingDiscount, sortOrder } = req.body;
    const [pkg] = await db.insert(membershipPackagesTable).values({
      name, nameEn: nameEn || name, description, descriptionEn, price: String(price), durationDays,
      benefits, benefitsEn, maxBookingsPerMonth, bookingDiscount: String(bookingDiscount || 0), sortOrder: sortOrder || 0,
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
    const { name, nameEn, description, descriptionEn, price, durationDays, benefits, benefitsEn, maxBookingsPerMonth, bookingDiscount, isActive, sortOrder } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (nameEn !== undefined) updates.nameEn = nameEn;
    if (description !== undefined) updates.description = description;
    if (descriptionEn !== undefined) updates.descriptionEn = descriptionEn;
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

// DELETE /packages/:id — admin
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await db.update(membershipPackagesTable).set({ isActive: false }).where(eq(membershipPackagesTable.id, parseInt(req.params.id)));
    return res.json({ message: "Package deactivated" });
  } catch {
    return res.status(500).json({ error: "Failed to delete package" });
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
      .where(eq(memberPackagesTable.userId, req.user!.userId))
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
router.post("/:id/purchase", authenticate, async (req, res) => {
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
    });

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + pkg.durationDays);

    const [mp] = await db.insert(memberPackagesTable).values({
      userId: req.user!.userId,
      packageId,
      pricePaid: String(price),
      endDate,
    }).returning();

    return res.status(201).json({ ...mp, pricePaid: Number(mp.pricePaid), startDate: mp.startDate.toISOString(), endDate: mp.endDate.toISOString(), createdAt: mp.createdAt.toISOString(), package: { ...pkg, price: Number(pkg.price) } });
  } catch {
    return res.status(500).json({ error: "Failed to purchase package" });
  }
});

export default router;
