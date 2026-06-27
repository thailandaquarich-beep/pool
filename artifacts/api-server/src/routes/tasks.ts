import { Router } from "express";
import { db, staffTasksTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { authenticate, isStaffRole, requireAdmin, requireStaff } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";

const router = Router();
const MAX_PHOTO_CHARS = 7_500_000; // roughly 5.5MB binary as base64; API body limit is 12MB.
const STAFF_ROLES = ["admin", "super_admin", "instructor", "staff"] as const;

const bkkDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function cleanText(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanPhoto(value: unknown) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("data:image/")) return null;
  if (value.length > MAX_PHOTO_CHARS) return null;
  return value;
}

function serializeTask(row: typeof staffTasksTable.$inferSelect, user?: any, creator?: any) {
  return {
    ...row,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    startPhotoTakenAt: row.startPhotoTakenAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    endPhotoTakenAt: row.endPhotoTakenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user,
    creator,
  };
}

async function getTaskForCurrentStaff(taskId: number, userId: number) {
  const [row] = await db
    .select()
    .from(staffTasksTable)
    .where(and(eq(staffTasksTable.id, taskId), eq(staffTasksTable.assignedTo, userId)))
    .limit(1);
  return row;
}

router.get("/me", authenticate, requireStaff, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const date = isDateString(req.query.date) ? req.query.date : undefined;
    const conds = [eq(staffTasksTable.assignedTo, userId)];
    if (date) conds.push(eq(staffTasksTable.taskDate, date));

    const rows = await db
      .select({
        task: staffTasksTable,
        creator: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role },
      })
      .from(staffTasksTable)
      .leftJoin(usersTable, eq(staffTasksTable.createdBy, usersTable.id))
      .where(and(...conds))
      .orderBy(desc(staffTasksTable.taskDate), desc(staffTasksTable.createdAt))
      .limit(200);

    return res.json(rows.map((r) => serializeTask(r.task, undefined, r.creator)));
  } catch {
    return res.status(500).json({ error: "Failed to load tasks" });
  }
});

router.post("/:id/accept", authenticate, requireStaff, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await getTaskForCurrentStaff(id, req.user!.userId);
    if (!existing) return res.status(404).json({ error: "Task not found" });
    if (existing.status === "completed" || existing.status === "cancelled") {
      return res.status(400).json({ error: "Task already closed" });
    }

    const now = new Date();
    const [row] = await db
      .update(staffTasksTable)
      .set({ status: existing.status === "assigned" ? "accepted" : existing.status, acceptedAt: existing.acceptedAt ?? now, updatedAt: now })
      .where(eq(staffTasksTable.id, id))
      .returning();
    return res.json(serializeTask(row));
  } catch {
    return res.status(500).json({ error: "Failed to accept task" });
  }
});

router.post("/:id/start", authenticate, requireStaff, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const photo = cleanPhoto(req.body?.photoDataUrl);
    if (!photo) return res.status(400).json({ error: "Valid before photo is required" });

    const existing = await getTaskForCurrentStaff(id, req.user!.userId);
    if (!existing) return res.status(404).json({ error: "Task not found" });
    if (existing.status === "completed" || existing.status === "cancelled") {
      return res.status(400).json({ error: "Task already closed" });
    }

    const now = new Date();
    const [row] = await db
      .update(staffTasksTable)
      .set({
        status: "in_progress",
        acceptedAt: existing.acceptedAt ?? now,
        startedAt: existing.startedAt ?? now,
        startPhotoUrl: photo,
        startPhotoTakenAt: now,
        updatedAt: now,
      })
      .where(eq(staffTasksTable.id, id))
      .returning();
    return res.json(serializeTask(row));
  } catch {
    return res.status(500).json({ error: "Failed to start task" });
  }
});

router.post("/:id/complete", authenticate, requireStaff, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const photo = cleanPhoto(req.body?.photoDataUrl);
    if (!photo) return res.status(400).json({ error: "Valid after photo is required" });

    const existing = await getTaskForCurrentStaff(id, req.user!.userId);
    if (!existing) return res.status(404).json({ error: "Task not found" });
    if (!existing.startPhotoUrl) return res.status(400).json({ error: "Before photo is required first" });
    if (existing.status === "completed" || existing.status === "cancelled") {
      return res.status(400).json({ error: "Task already closed" });
    }

    const now = new Date();
    const [row] = await db
      .update(staffTasksTable)
      .set({
        status: "completed",
        completedAt: now,
        endPhotoUrl: photo,
        endPhotoTakenAt: now,
        completionNote: cleanText(req.body?.completionNote, 1000) || null,
        updatedAt: now,
      })
      .where(eq(staffTasksTable.id, id))
      .returning();
    return res.json(serializeTask(row));
  } catch {
    return res.status(500).json({ error: "Failed to complete task" });
  }
});

router.get("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const today = bkkDate();
    const from = isDateString(req.query.from) ? req.query.from : (isDateString(req.query.date) ? req.query.date : today);
    const to = isDateString(req.query.to) ? req.query.to : (isDateString(req.query.date) ? req.query.date : today);
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const conds: any[] = [gte(staffTasksTable.taskDate, from), lte(staffTasksTable.taskDate, to)];
    if (userId) conds.push(eq(staffTasksTable.assignedTo, userId));
    if (status && ["assigned", "accepted", "in_progress", "completed", "cancelled"].includes(status)) {
      conds.push(eq(staffTasksTable.status, status as any));
    }
    const bf = branchEq(req, staffTasksTable.branchId);
    if (bf) conds.push(bf);

    const rows = await db
      .select({
        task: staffTasksTable,
        user: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, profileImageUrl: usersTable.profileImageUrl },
      })
      .from(staffTasksTable)
      .innerJoin(usersTable, eq(staffTasksTable.assignedTo, usersTable.id))
      .where(and(...conds))
      .orderBy(desc(staffTasksTable.taskDate), desc(staffTasksTable.createdAt))
      .limit(500);

    return res.json(rows.map((r) => serializeTask(r.task, r.user)));
  } catch {
    return res.status(500).json({ error: "Failed to load tasks" });
  }
});

router.post("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const title = cleanText(req.body?.title, 160);
    const description = cleanText(req.body?.description, 1500);
    const taskDate = isDateString(req.body?.taskDate) ? req.body.taskDate : bkkDate();
    const assignedTo = parseInt(req.body?.assignedTo);
    if (!title || !assignedTo) return res.status(400).json({ error: "title and assignedTo required" });

    const userConds: any[] = [eq(usersTable.id, assignedTo), inArray(usersTable.role, [...STAFF_ROLES])];
    const bf = branchEq(req, usersTable.branchId);
    if (bf) userConds.push(bf);
    const [assignee] = await db.select().from(usersTable).where(and(...userConds)).limit(1);
    if (!assignee || !isStaffRole(assignee.role)) return res.status(400).json({ error: "Assigned user must be staff" });

    const [row] = await db
      .insert(staffTasksTable)
      .values({
        title,
        description: description || null,
        taskDate,
        assignedTo,
        createdBy: req.user!.userId,
        branchId: newRowBranch(req),
      })
      .returning();
    return res.status(201).json(serializeTask(row, assignee));
  } catch {
    return res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/:id", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(staffTasksTable).where(and(eq(staffTasksTable.id, id), branchEq(req, staffTasksTable.branchId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const updates: Partial<typeof staffTasksTable.$inferInsert> = { updatedAt: new Date() };
    if (typeof req.body?.title === "string") updates.title = cleanText(req.body.title, 160) || existing.title;
    if (typeof req.body?.description === "string") updates.description = cleanText(req.body.description, 1500) || null;
    if (isDateString(req.body?.taskDate)) updates.taskDate = req.body.taskDate;
    if (typeof req.body?.status === "string" && ["assigned", "accepted", "in_progress", "completed", "cancelled"].includes(req.body.status)) {
      updates.status = req.body.status as any;
    }
    if (req.body?.assignedTo) {
      const assignedTo = parseInt(req.body.assignedTo);
      const userConds: any[] = [eq(usersTable.id, assignedTo), inArray(usersTable.role, [...STAFF_ROLES])];
      const bf = branchEq(req, usersTable.branchId);
      if (bf) userConds.push(bf);
      const [assignee] = await db.select().from(usersTable).where(and(...userConds)).limit(1);
      if (!assignee) return res.status(400).json({ error: "Assigned user must be staff" });
      updates.assignedTo = assignedTo;
    }

    const [row] = await db.update(staffTasksTable).set(updates).where(eq(staffTasksTable.id, id)).returning();
    return res.json(serializeTask(row));
  } catch {
    return res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/:id", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(staffTasksTable).where(and(eq(staffTasksTable.id, id), branchEq(req, staffTasksTable.branchId)));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
