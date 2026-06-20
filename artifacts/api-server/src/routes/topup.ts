import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { db, topupRequestsTable, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { getOrCreateWallet } from "./wallet.js";
import { dataDirs } from "../lib/dataPaths.js";

const router = Router();

// Persist a base64 data-URL slip into data/slips/ for record-keeping. Best-effort.
async function saveSlipFile(dataUrl: unknown, topupId: number, userId: number): Promise<void> {
  if (typeof dataUrl !== "string") return;
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return;
  try {
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    const buf = Buffer.from(m[2], "base64");
    await fs.mkdir(dataDirs.slips, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(dataDirs.slips, `topup-${topupId}-user-${userId}-${stamp}.${ext}`), buf);
  } catch {
    /* best-effort: never block a top-up because a file write failed */
  }
}

// POST /topup — member submits top-up request
router.post("/", authenticate, async (req, res) => {
  try {
    const { amount, method, slipImageUrl, note } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const [request] = await db
      .insert(topupRequestsTable)
      .values({
        userId: req.user!.userId,
        amount: String(amount),
        method: method || "bank_transfer",
        slipImageUrl,
        note,
      })
      .returning();

    // Archive the uploaded slip image into the organized data/slips/ folder.
    await saveSlipFile(slipImageUrl, request.id, req.user!.userId);

    return res.status(201).json({ ...request, amount: Number(request.amount), createdAt: request.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: "Failed to submit top-up request" });
  }
});

// GET /topup/my — member: my requests
router.get("/my", authenticate, async (req, res) => {
  try {
    const requests = await db
      .select()
      .from(topupRequestsTable)
      .where(eq(topupRequestsTable.userId, req.user!.userId))
      .orderBy(desc(topupRequestsTable.createdAt))
      .limit(50);
    return res.json(requests.map(r => ({ ...r, amount: Number(r.amount), createdAt: r.createdAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() || null })));
  } catch {
    return res.status(500).json({ error: "Failed to get requests" });
  }
});

// GET /topup/admin — admin: all requests
router.get("/admin", authenticate, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let query = db
      .select({
        request: topupRequestsTable,
        user: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username },
      })
      .from(topupRequestsTable)
      .innerJoin(usersTable, eq(topupRequestsTable.userId, usersTable.id))
      .$dynamic();

    if (status) query = query.where(eq(topupRequestsTable.status, status as any)) as any;

    const rows = await (query as any).orderBy(desc(topupRequestsTable.createdAt)).limit(100);
    return res.json(rows.map((r: any) => ({
      ...r.request,
      amount: Number(r.request.amount),
      createdAt: r.request.createdAt.toISOString(),
      reviewedAt: r.request.reviewedAt?.toISOString() || null,
      user: r.user,
    })));
  } catch {
    return res.status(500).json({ error: "Failed to list requests" });
  }
});

// POST /topup/:id/approve — admin: approve
router.post("/:id/approve", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reviewNote } = req.body;

    const [request] = await db.select().from(topupRequestsTable).where(eq(topupRequestsTable.id, id)).limit(1);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Already processed" });

    const wallet = await getOrCreateWallet(request.userId);
    const newBalance = Number(wallet.balance) + Number(request.amount);

    await db.update(walletsTable).set({ balance: String(newBalance), updatedAt: new Date() }).where(eq(walletsTable.userId, request.userId));

    await db.insert(transactionsTable).values({
      userId: request.userId,
      amount: String(request.amount),
      type: "topup",
      description: `เติมเงินผ่าน ${request.method} (อนุมัติโดยแอดมิน)`,
      status: "completed",
      referenceId: id,
    });

    const [updated] = await db
      .update(topupRequestsTable)
      .set({ status: "approved", reviewedBy: req.user!.userId, reviewNote, reviewedAt: new Date() })
      .where(eq(topupRequestsTable.id, id))
      .returning();

    return res.json({ ...updated, amount: Number(updated.amount), createdAt: updated.createdAt.toISOString(), reviewedAt: updated.reviewedAt?.toISOString() || null });
  } catch {
    return res.status(500).json({ error: "Failed to approve" });
  }
});

// POST /topup/:id/reject — admin: reject
router.post("/:id/reject", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reviewNote } = req.body;

    const [request] = await db.select().from(topupRequestsTable).where(eq(topupRequestsTable.id, id)).limit(1);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Already processed" });

    const [updated] = await db
      .update(topupRequestsTable)
      .set({ status: "rejected", reviewedBy: req.user!.userId, reviewNote, reviewedAt: new Date() })
      .where(eq(topupRequestsTable.id, id))
      .returning();

    return res.json({ ...updated, amount: Number(updated.amount), createdAt: updated.createdAt.toISOString(), reviewedAt: updated.reviewedAt?.toISOString() || null });
  } catch {
    return res.status(500).json({ error: "Failed to reject" });
  }
});

export default router;
