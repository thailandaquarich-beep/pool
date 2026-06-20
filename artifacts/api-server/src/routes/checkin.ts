import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { getActiveUsages, pickUsable, consumeUse, NoQuotaError } from "../lib/packageUsage.js";
import { logUsage } from "../lib/usageLog.js";
import { memberCode } from "../lib/memberCode.js";

const router = Router();

function publicUserCard(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    houseNumber: u.houseNumber,
    profileImageUrl: u.profileImageUrl,
  };
}

// GET /checkin/my-code — member: get (or lazily generate) the personal token for their QR.
router.get("/my-code", authenticate, async (req, res) => {
  try {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!u) return res.status(404).json({ error: "User not found" });
    let token = u.checkinToken;
    if (!token) {
      token = randomUUID().replace(/-/g, "");
      await db.update(usersTable).set({ checkinToken: token }).where(eq(usersTable.id, u.id));
    }
    return res.json({ token });
  } catch {
    return res.status(500).json({ error: "Failed to get code" });
  }
});

// GET /checkin/lookup?token= — admin: preview member + remaining BEFORE deducting.
router.get("/lookup", authenticate, requireAdmin, async (req, res) => {
  try {
    const token = ((req.query.token as string) || "").trim();
    if (!token) return res.status(400).json({ error: "token required" });
    const [u] = await db.select().from(usersTable).where(eq(usersTable.checkinToken, token)).limit(1);
    if (!u) return res.status(404).json({ error: "ไม่พบสมาชิกจาก QR นี้" });
    const usages = await getActiveUsages(db, u.id);
    const usable = pickUsable(usages);
    const hasUnlimited = usages.some((x) => x.remaining === null);
    return res.json({
      user: publicUserCard(u),
      hasQuota: !!usable,
      totalRemaining: hasUnlimited ? null : usages.reduce((s, x) => s + (x.remaining ?? 0), 0),
      packageName: usable?.package.name ?? null,
    });
  } catch {
    return res.status(500).json({ error: "Failed to lookup" });
  }
});

// POST /checkin — admin: scan a member QR token -> deduct one use (walk-in check-in).
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const token = ((req.body.token as string) || "").trim();
    if (!token) return res.status(400).json({ error: "token required" });
    const [u] = await db.select().from(usersTable).where(eq(usersTable.checkinToken, token)).limit(1);
    if (!u) return res.status(404).json({ error: "ไม่พบสมาชิกจาก QR นี้" });

    let consumed;
    try {
      consumed = await db.transaction((tx) => consumeUse(tx, u.id, { source: "checkin", note: "เช็คอินหน้างาน (สแกน QR)" }));
    } catch (err) {
      if (err instanceof NoQuotaError) {
        return res.status(400).json({ error: "สมาชิกไม่มีจำนวนครั้งคงเหลือ", needPackage: true, user: publicUserCard(u) });
      }
      throw err;
    }

    await logUsage({
      userId: u.id,
      memberCode: memberCode(u.id),
      name: `${u.firstName} ${u.lastName}`,
      source: "checkin",
      packageName: consumed.package.name,
      detail: "สแกน QR เช็คอินหน้างาน",
    });

    return res.json({
      message: "เช็คอินสำเร็จ",
      user: publicUserCard(u),
      packageName: consumed.package.name,
      remainingAfter: consumed.remainingAfter,
    });
  } catch {
    return res.status(500).json({ error: "Failed to check in" });
  }
});

export default router;
