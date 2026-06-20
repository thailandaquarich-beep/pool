import { Router } from "express";
import { db, facilitiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";

const router = Router();

// GET /facilities — public
router.get("/", async (req, res) => {
  try {
    const facilities = await db
      .select()
      .from(facilitiesTable)
      .where(eq(facilitiesTable.isActive, true))
      .orderBy(facilitiesTable.name);
    return res.json(facilities);
  } catch {
    return res.status(500).json({ error: "Failed to list facilities" });
  }
});

// GET /facilities/all — admin only (includes inactive)
router.get("/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const facilities = await db.select().from(facilitiesTable).orderBy(facilitiesTable.name);
    return res.json(facilities);
  } catch {
    return res.status(500).json({ error: "Failed to list facilities" });
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
    return res.json(facility);
  } catch {
    return res.status(500).json({ error: "Failed to get facility" });
  }
});

// POST /facilities — admin only
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, nameEn, description, descriptionEn, capacity, openTime, closeTime, imageUrl, rules, rulesEn, slotDurationMinutes,
      location, phone, mapUrl, amenities, depth, lanes, priceInfo } = req.body;
    const [facility] = await db
      .insert(facilitiesTable)
      .values({
        name, nameEn, description, descriptionEn, capacity: capacity || 20,
        openTime: openTime || "06:00", closeTime: closeTime || "20:00", imageUrl, rules, rulesEn,
        slotDurationMinutes: slotDurationMinutes || 60,
        location, phone, mapUrl, amenities, depth,
        lanes: lanes != null && lanes !== "" ? Number(lanes) : null, priceInfo,
      })
      .returning();
    return res.status(201).json(facility);
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
      "location", "phone", "mapUrl", "amenities", "depth", "priceInfo"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
    }
    if (req.body.lanes !== undefined) (updates as any).lanes = req.body.lanes === "" || req.body.lanes === null ? null : Number(req.body.lanes);
    const [facility] = await db.update(facilitiesTable).set(updates).where(eq(facilitiesTable.id, id)).returning();
    if (!facility) return res.status(404).json({ error: "Facility not found" });
    return res.json(facility);
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

export default router;
