import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { eq, and, or, gte, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";

const router = Router();

// GET /announcements — public (published, not expired)
router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const announcements = await db
      .select()
      .from(announcementsTable)
      .where(eq(announcementsTable.isPublished, true))
      .orderBy(sql`${announcementsTable.isPinned} DESC, ${announcementsTable.createdAt} DESC`)
      .limit(20);
    return res.json(announcements.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), expiresAt: a.expiresAt?.toISOString() || null })));
  } catch {
    return res.status(500).json({ error: "Failed to list announcements" });
  }
});

// GET /announcements/all — admin only
router.get("/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const announcements = await db
      .select()
      .from(announcementsTable)
      .orderBy(sql`${announcementsTable.isPinned} DESC, ${announcementsTable.createdAt} DESC`);
    return res.json(announcements.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), expiresAt: a.expiresAt?.toISOString() || null })));
  } catch {
    return res.status(500).json({ error: "Failed to list announcements" });
  }
});

// POST /announcements — admin only
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, titleEn, content, contentEn, type, isPublished, isPinned, expiresAt } = req.body;
    const [ann] = await db
      .insert(announcementsTable)
      .values({ title, titleEn, content, contentEn, type: type || "info", isPublished: isPublished ?? true, isPinned: isPinned ?? false, expiresAt: expiresAt ? new Date(expiresAt) : undefined })
      .returning();
    return res.status(201).json({ ...ann, createdAt: ann.createdAt.toISOString(), expiresAt: ann.expiresAt?.toISOString() || null });
  } catch {
    return res.status(500).json({ error: "Failed to create announcement" });
  }
});

// PATCH /announcements/:id — admin only
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates: Partial<typeof announcementsTable.$inferInsert> = {};
    const fields = ["title", "titleEn", "content", "contentEn", "type", "isPublished", "isPinned"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
    }
    if (req.body.expiresAt !== undefined) updates.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : undefined;
    const [ann] = await db.update(announcementsTable).set(updates).where(eq(announcementsTable.id, id)).returning();
    if (!ann) return res.status(404).json({ error: "Announcement not found" });
    return res.json({ ...ann, createdAt: ann.createdAt.toISOString(), expiresAt: ann.expiresAt?.toISOString() || null });
  } catch {
    return res.status(500).json({ error: "Failed to update announcement" });
  }
});

// DELETE /announcements/:id — admin only
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await db.delete(announcementsTable).where(eq(announcementsTable.id, parseInt(req.params.id)));
    return res.json({ message: "Announcement deleted" });
  } catch {
    return res.status(500).json({ error: "Failed to delete announcement" });
  }
});

export default router;
