import { Router, type Request, type Response, type NextFunction } from "express";
import { db, branchesTable, usersTable } from "@workspace/db";
import { eq, sql, asc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { attachBranch } from "../middlewares/branch.js";

// Franchise branches ("จัดการสาขา"). super_admin manages every branch; other
// staff can read only their own branch (for header display / switcher hiding).
const router = Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Forbidden: super admin only" });
  next();
}

function serialize(b: typeof branchesTable.$inferSelect, memberCount?: number) {
  return { ...b, createdAt: b.createdAt.toISOString(), ...(memberCount != null ? { memberCount } : {}) };
}

// GET /branches — super_admin: all branches (+ member counts); others: just their own.
router.get("/", authenticate, attachBranch, async (req, res) => {
  try {
    if (req.isSuperAdmin) {
      const branches = await db.select().from(branchesTable).orderBy(asc(branchesTable.id));
      const counts = await db
        .select({ branchId: usersTable.branchId, n: sql<number>`count(*)::int` })
        .from(usersTable)
        .groupBy(usersTable.branchId);
      const cmap = new Map(counts.map(c => [c.branchId, c.n]));
      return res.json(branches.map(b => serialize(b, cmap.get(b.id) || 0)));
    }
    const id = req.userBranchId ?? 1;
    const own = await db.select().from(branchesTable).where(eq(branchesTable.id, id)).limit(1);
    return res.json(own.map(b => serialize(b)));
  } catch {
    return res.status(500).json({ error: "Failed to list branches" });
  }
});

// Fields a super_admin may set on a branch (besides the immutable id/isMain/createdAt).
const EDITABLE = ["name", "nameEn", "code", "address", "phone", "ownerName", "email", "lineId", "taxId", "openTime", "closeTime", "logoUrl", "note", "isActive"] as const;

// POST /branches — create (super_admin)
router.post("/", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: "name required" });
    const values: Record<string, unknown> = {};
    for (const k of EDITABLE) if (body[k] !== undefined && k !== "isActive") values[k] = body[k] === "" ? null : body[k];
    values.name = body.name;
    const [row] = await db.insert(branchesTable).values(values as typeof branchesTable.$inferInsert).returning();
    return res.status(201).json(serialize(row));
  } catch (e: any) {
    if (String(e?.message || "").includes("duplicate")) return res.status(400).json({ error: "รหัสสาขา (code) นี้ถูกใช้แล้ว" });
    return res.status(500).json({ error: "Failed to create branch" });
  }
});

// PATCH /branches/:id — update (super_admin)
router.patch("/:id", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body || {};
    const updates: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      if (body[k] !== undefined) updates[k] = (k !== "isActive" && body[k] === "") ? null : body[k];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "nothing to update" });
    const [row] = await db.update(branchesTable).set(updates).where(eq(branchesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Branch not found" });
    return res.json(serialize(row));
  } catch (e: any) {
    if (String(e?.message || "").includes("duplicate")) return res.status(400).json({ error: "รหัสสาขา (code) นี้ถูกใช้แล้ว" });
    return res.status(500).json({ error: "Failed to update branch" });
  }
});

// DELETE /branches/:id — remove an empty, non-main branch (super_admin)
router.delete("/:id", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, id)).limit(1);
    if (!b) return res.status(404).json({ error: "Branch not found" });
    if (b.isMain) return res.status(400).json({ error: "ลบสาขาหลักไม่ได้" });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.branchId, id));
    if (n > 0) return res.status(400).json({ error: `สาขานี้มีสมาชิก ${n} คน ย้าย/ลบสมาชิกก่อน` });
    await db.delete(branchesTable).where(eq(branchesTable.id, id));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete branch" });
  }
});

export default router;
