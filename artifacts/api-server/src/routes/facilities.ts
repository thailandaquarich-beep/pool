import { Router } from "express";
import { db, facilitiesTable, memberAddonsTable, walletsTable, transactionsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";
import { getOrCreateWallet } from "./wallet.js";
import { appendMemberLog } from "../lib/memberLog.js";

const router = Router();

// numeric `price` comes back as a string from pg — expose it as a number (or null)
const serialize = (f: typeof facilitiesTable.$inferSelect) => ({
  ...f,
  price: f.price != null ? Number(f.price) : null,
});

// GET /facilities — public
router.get("/", async (req, res) => {
  try {
    const facilities = await db
      .select()
      .from(facilitiesTable)
      .where(eq(facilitiesTable.isActive, true))
      .orderBy(facilitiesTable.name);
    return res.json(facilities.map(serialize));
  } catch {
    return res.status(500).json({ error: "Failed to list facilities" });
  }
});

// GET /facilities/all — admin only (includes inactive)
router.get("/all", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const facilities = await db.select().from(facilitiesTable).where(branchEq(req, facilitiesTable.branchId)).orderBy(facilitiesTable.name);
    return res.json(facilities.map(serialize));
  } catch {
    return res.status(500).json({ error: "Failed to list facilities" });
  }
});

// GET /facilities/my-addons — member: add-on packages they have purchased
router.get("/my-addons", authenticate, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(memberAddonsTable)
      .where(eq(memberAddonsTable.userId, req.user!.userId))
      .orderBy(desc(memberAddonsTable.createdAt));
    return res.json(rows.map((r) => ({
      ...r,
      pricePaid: Number(r.pricePaid),
      createdAt: r.createdAt.toISOString(),
    })));
  } catch {
    return res.status(500).json({ error: "Failed to get my add-ons" });
  }
});

// GET /facilities/:id
router.get("/:id", async (req, res) => {
  try {
    const [facility] = await db
      .select()
      .from(facilitiesTable)
      .where(eq(facilitiesTable.id, parseInt(req.params.id)))
      .limit(1);
    if (!facility) return res.status(404).json({ error: "Facility not found" });
    return res.json(serialize(facility));
  } catch {
    return res.status(500).json({ error: "Failed to get facility" });
  }
});

// POST /facilities — admin only
router.post("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const { name, nameEn, description, descriptionEn, capacity, openTime, closeTime, imageUrl, rules, rulesEn, slotDurationMinutes,
      location, phone, mapUrl, amenities, depth, lanes, priceInfo, isPurchasable, price } = req.body;
    const [facility] = await db
      .insert(facilitiesTable)
      .values({
        name, nameEn, description, descriptionEn, capacity: capacity || 20,
        openTime: openTime || "06:00", closeTime: closeTime || "20:00", imageUrl, rules, rulesEn,
        slotDurationMinutes: slotDurationMinutes || 60,
        location, phone, mapUrl, amenities, depth,
        lanes: lanes != null && lanes !== "" ? Number(lanes) : null, priceInfo,
        isPurchasable: !!isPurchasable,
        price: price != null && price !== "" ? String(price) : null,
        branchId: newRowBranch(req),
      })
      .returning();
    return res.status(201).json(serialize(facility));
  } catch {
    return res.status(500).json({ error: "Failed to create facility" });
  }
});

// PATCH /facilities/:id — admin only
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates: Partial<typeof facilitiesTable.$inferInsert> = {};
    const fields = ["name", "nameEn", "description", "descriptionEn", "capacity", "openTime", "closeTime", "imageUrl", "isActive", "rules", "rulesEn", "slotDurationMinutes",
      "location", "phone", "mapUrl", "amenities", "depth", "priceInfo", "isPurchasable"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
    }
    if (req.body.lanes !== undefined) (updates as any).lanes = req.body.lanes === "" || req.body.lanes === null ? null : Number(req.body.lanes);
    if (req.body.price !== undefined) (updates as any).price = req.body.price === "" || req.body.price === null ? null : String(req.body.price);
    const [facility] = await db.update(facilitiesTable).set(updates).where(eq(facilitiesTable.id, id)).returning();
    if (!facility) return res.status(404).json({ error: "Facility not found" });
    return res.json(serialize(facility));
  } catch {
    return res.status(500).json({ error: "Failed to update facility" });
  }
});

// DELETE /facilities/:id — admin only
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await db.update(facilitiesTable).set({ isActive: false }).where(eq(facilitiesTable.id, parseInt(req.params.id)));
    return res.json({ message: "Facility deactivated" });
  } catch {
    return res.status(500).json({ error: "Failed to delete facility" });
  }
});

// POST /facilities/:id/purchase — member: buy this service as an add-on package (deduct from wallet)
router.post("/:id/purchase", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [facility] = await db.select().from(facilitiesTable).where(eq(facilitiesTable.id, id)).limit(1);
    if (!facility || !facility.isActive) return res.status(404).json({ error: "Facility not found" });
    if (!facility.isPurchasable || facility.price == null) {
      return res.status(400).json({ error: "บริการนี้ไม่เปิดให้สั่งซื้อ" });
    }

    const price = Number(facility.price);
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
      description: `ซื้อแพ็คเกจเสริม: ${facility.name}`,
      status: "completed",
      referenceId: id,
    });

    const [addon] = await db.insert(memberAddonsTable).values({
      userId: req.user!.userId,
      facilityId: id,
      name: facility.name,
      pricePaid: String(price),
    }).returning();

    await appendMemberLog({ userId: req.user!.userId }, "activity", {
      action: "addon_purchase", name: facility.name, price,
    });

    return res.status(201).json({ ...addon, pricePaid: Number(addon.pricePaid), createdAt: addon.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: "Failed to purchase add-on" });
  }
});

export default router;
