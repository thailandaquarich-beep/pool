import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq } from "../middlewares/branch.js";
import { getActiveUsages, pickUsable, consumeUse, NoQuotaError } from "../lib/packageUsage.js";
import { logUsage } from "../lib/usageLog.js";
import { memberCode } from "../lib/memberCode.js";
import { appendMemberLog } from "../lib/memberLog.js";
import { normalizePhone } from "../lib/phone.js";

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

function memberIdFromCode(input: string) {
  const m = /^ART0*(\d+)$/i.exec(input.trim());
  return m ? Number(m[1]) : null;
}

async function findMemberForCheckin(input: string, req: any) {
  const value = input.trim();
  const byCode = memberIdFromCode(value);
  const phoneE164 = normalizePhone(value);
  const branch = branchEq(req, usersTable.branchId);
  const identity = byCode
    ? eq(usersTable.id, byCode)
    : phoneE164
      ? eq(usersTable.phoneE164, phoneE164)
      : eq(usersTable.checkinToken, value);
  const [u] = await db.select().from(usersTable).where(and(identity, branch)).limit(1);
  return u ?? null;
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
router.get("/lookup", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const token = ((req.query.token as string) || "").trim();
    if (!token) return res.status(400).json({ error: "token required" });
    // Branch-confine the scan: a branch admin can't look up another branch's member.
    const u = await findMemberForCheckin(token, req);
    if (!u) return res.status(404).json({ error: "ไม่พบสมาชิกจากรหัสสมาชิก เบอร์โทร หรือ QR นี้" });
    const usages = await getActiveUsages(db, u.id);
    const usable = pickUsable(usages);
    const hasUnlimited = usages.some((x) => x.remaining === null);
    return res.json({
      user: publicUserCard(u),
      hasQuota: !!usable,
      totalRemaining: hasUnlimited ? null : usages.reduce((s, x) => s + (x.remaining ?? 0), 0),
      packageName: usable?.package.name ?? null,
      packages: usages.map((x) => ({
        memberPackageId: x.memberPackage.id,
        packageId: x.package.id,
        name: x.package.name,
        quota: x.quota,
        used: x.used,
        remaining: x.remaining,
        startDate: x.memberPackage.startDate.toISOString(),
        endDate: x.memberPackage.endDate.toISOString(),
      })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to lookup" });
  }
});

// POST /checkin — admin: scan a member QR token -> deduct one use (walk-in check-in).
router.post("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const token = ((req.body.token as string) || "").trim();
    const memberPackageId = req.body.memberPackageId ? Number(req.body.memberPackageId) : null;
    if (!token) return res.status(400).json({ error: "token required" });
    const u = await findMemberForCheckin(token, req);
    if (!u) return res.status(404).json({ error: "ไม่พบสมาชิกจากรหัสสมาชิก เบอร์โทร หรือ QR นี้" });

    let consumed;
    try {
      consumed = await db.transaction((tx) => consumeUse(tx, u.id, { source: "checkin", memberPackageId, note: "เช็คอินหน้างาน (สแกน QR)" }));
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

    await appendMemberLog({ userId: u.id }, "checkins", {
      event: "checkin",
      method: "qr_scan",
      name: `${u.firstName} ${u.lastName}`,
      packageName: consumed.package.name,
      remainingAfter: consumed.remainingAfter,
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
