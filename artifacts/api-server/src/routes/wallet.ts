import { Router } from "express";
import { db, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq } from "../middlewares/branch.js";

const router = Router();

async function getOrCreateWallet(userId: number) {
  const [existing] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  if (existing) return existing;
  // Stamp the wallet with its owner's branch so admin per-branch listings are correct.
  const [u] = await db.select({ b: usersTable.branchId }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [created] = await db.insert(walletsTable).values({ userId, branchId: u?.b ?? 1 }).returning();
  return created;
}

// GET /wallet/me — get my wallet
router.get("/me", authenticate, async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.userId);
    return res.json({ ...wallet, balance: Number(wallet.balance) });
  } catch {
    return res.status(500).json({ error: "Failed to get wallet" });
  }
});

// GET /wallet/transactions — get my transactions
router.get("/transactions", authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const txs = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, req.user!.userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, req.user!.userId));

    return res.json({
      transactions: txs.map(t => ({ ...t, amount: Number(t.amount), createdAt: t.createdAt.toISOString() })),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch {
    return res.status(500).json({ error: "Failed to get transactions" });
  }
});

// GET /wallet/all — admin: list all wallets (scoped to the admin's branch)
router.get("/all", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const wallets = await db.select().from(walletsTable).where(branchEq(req, walletsTable.branchId)).orderBy(desc(walletsTable.balance));
    return res.json(wallets.map(w => ({ ...w, balance: Number(w.balance) })));
  } catch {
    return res.status(500).json({ error: "Failed to list wallets" });
  }
});

// POST /wallet/admin-adjust — admin: credit/debit a user's wallet
router.post("/admin-adjust", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const { userId, amount, description, type } = req.body;
    if (!userId || !amount || !description) {
      return res.status(400).json({ error: "userId, amount, description required" });
    }

    const wallet = await getOrCreateWallet(userId);
    // A branch admin may only adjust wallets in their own branch.
    if (req.branchId != null && wallet.branchId !== req.branchId) {
      return res.status(403).json({ error: "ไม่สามารถปรับยอดสมาชิกต่างสาขาได้" });
    }
    const newBalance = Number(wallet.balance) + Number(amount);
    if (newBalance < 0) return res.status(400).json({ error: "Insufficient balance" });

    const [updated] = await db
      .update(walletsTable)
      .set({ balance: String(newBalance), updatedAt: new Date() })
      .where(eq(walletsTable.userId, userId))
      .returning();

    await db.insert(transactionsTable).values({
      userId,
      amount: String(Math.abs(Number(amount))),
      type: amount > 0 ? "admin_credit" : "admin_debit",
      description,
      status: "completed",
      branchId: wallet.branchId,
    });

    return res.json({ ...updated, balance: Number(updated.balance) });
  } catch {
    return res.status(500).json({ error: "Failed to adjust wallet" });
  }
});

export default router;
export { getOrCreateWallet };
