import { Router } from "express";
import { db, leaveRequestsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate, requireStaff, requireAdmin, isAdminRole } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";

// Staff leave requests ("ระบบลางาน"). Staff submit; admins approve/reject.
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEAVE_TYPES = ["sick", "personal", "vacation", "other"];

const inclusiveDays = (start: string, end: string) =>
  Math.floor((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1;

function serialize(r: typeof leaveRequestsTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}

// POST /leave — staff submits a request
router.post("/", authenticate, requireStaff, attachBranch, async (req, res) => {
  try {
    const { type, startDate, endDate, reason } = req.body || {};
    if (!DATE_RE.test(String(startDate)) || !DATE_RE.test(String(endDate))) {
      return res.status(400).json({ error: "กรุณาเลือกวันที่ให้ถูกต้อง" });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา" });
    }
    const t = LEAVE_TYPES.includes(type) ? type : "personal";
    const [row] = await db.insert(leaveRequestsTable).values({
      userId: req.user!.userId,
      type: t,
      startDate,
      endDate,
      days: inclusiveDays(startDate, endDate),
      reason: typeof reason === "string" ? reason.slice(0, 500) : null,
      branchId: newRowBranch(req),
    }).returning();
    return res.status(201).json(serialize(row));
  } catch {
    return res.status(500).json({ error: "Failed to submit leave request" });
  }
});

// GET /leave/me — the signed-in staff member's own requests
router.get("/me", authenticate, requireStaff, async (req, res) => {
  try {
    const rows = await db.select().from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.userId, req.user!.userId))
      .orderBy(desc(leaveRequestsTable.createdAt)).limit(100);
    return res.json(rows.map(serialize));
  } catch {
    return res.status(500).json({ error: "Failed to load leave requests" });
  }
});

// GET /leave?status= — admin list (branch-scoped), with requester info
router.get("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const conds: any[] = [];
    const bf = branchEq(req, leaveRequestsTable.branchId);
    if (bf) conds.push(bf);
    if (status) conds.push(eq(leaveRequestsTable.status, status));

    const rows = await db.select({
      r: leaveRequestsTable,
      user: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, profileImageUrl: usersTable.profileImageUrl },
    }).from(leaveRequestsTable)
      .innerJoin(usersTable, eq(leaveRequestsTable.userId, usersTable.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(leaveRequestsTable.createdAt)).limit(500);

    return res.json(rows.map((x) => ({ ...serialize(x.r), user: x.user })));
  } catch {
    return res.status(500).json({ error: "Failed to list leave requests" });
  }
});

// GET /leave/pending-count — admin nav badge
router.get("/pending-count", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const conds: any[] = [eq(leaveRequestsTable.status, "pending")];
    const bf = branchEq(req, leaveRequestsTable.branchId);
    if (bf) conds.push(bf);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leaveRequestsTable).where(and(...conds));
    return res.json({ count });
  } catch {
    return res.status(500).json({ error: "Failed to count" });
  }
});

// PATCH /leave/:id — admin approves / rejects
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, reviewNote } = req.body || {};
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [row] = await db.update(leaveRequestsTable).set({
      status,
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      reviewNote: typeof reviewNote === "string" ? reviewNote.slice(0, 500) : existing.reviewNote,
    }).where(eq(leaveRequestsTable.id, id)).returning();
    return res.json(serialize(row));
  } catch {
    return res.status(500).json({ error: "Failed to update leave request" });
  }
});

// DELETE /leave/:id — staff cancels their own PENDING request; admin deletes any
router.delete("/:id", authenticate, requireStaff, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (!isAdminRole(req.user!.role)) {
      if (row.userId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });
      if (row.status !== "pending") return res.status(400).json({ error: "ยกเลิกได้เฉพาะคำขอที่รออนุมัติ" });
    }
    await db.delete(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
