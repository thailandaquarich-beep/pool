import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middlewares/auth.js";
import { backupUsers } from "../lib/backup.js";
import { memberCode } from "../lib/memberCode.js";
import { writeMemberProfile, initMemberFolder } from "../lib/memberLog.js";
import { clientIp, logClientSession } from "../lib/clientInfo.js";
import { generateCaptcha, verifyCaptcha } from "../lib/captcha.js";
import { createOtp, verifyOtp, resendWait } from "../lib/otp.js";
import { sendMail, mailerConfigured } from "../lib/mailer.js";
import { normalizePhone } from "../lib/phone.js";
import { clearRateLimit, rateLimit, requestIp } from "../middlewares/security.js";
import { recordAudit } from "../lib/audit.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loginLimitKey(req: Request): string {
  const identifier = String(req.body?.usernameOrEmail || "").trim().toLowerCase() || "unknown";
  return `${requestIp(req)}:${identifier}`;
}

function formatUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return { ...rest, memberCode: memberCode(user.id), createdAt: rest.createdAt.toISOString() };
}

function otpEmailHtml(code: string): string {
  return `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:auto;padding:28px;background:#f0f7fb;border-radius:16px">
    <h2 style="margin:0 0 4px;color:#0e7490">Aquarich</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:14px">ศูนย์ดูแลสุขภาพครบวงจร</p>
    <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;border:1px solid #e2e8f0">
      <p style="margin:0 0 8px;color:#334155;font-size:15px">รหัสยืนยันการสมัครสมาชิกของคุณ</p>
      <p style="margin:0 0 8px;color:#334155;font-size:13px">Your verification code</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0891b2;margin:10px 0">${code}</div>
      <p style="margin:8px 0 0;color:#94a3b8;font-size:12px">รหัสนี้ใช้ได้ภายใน 10 นาที · This code expires in 10 minutes</p>
    </div>
    <p style="margin:18px 0 0;color:#94a3b8;font-size:12px">หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>
  </div>`;
}

// GET /auth/captcha — issue a self-hosted captcha challenge (id + SVG markup).
router.get("/captcha", (_req, res) => {
  const { id, svg } = generateCaptcha();
  return res.json({ id, svg });
});

// POST /auth/register/send-otp — verify captcha, then email a 6-digit OTP.
// Gating OTP send behind the captcha prevents bots from spamming emails.
router.post(
  "/register/send-otp",
  rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    keyPrefix: "otp",
    key: (req) => `${requestIp(req)}:${String(req.body?.email || "").trim().toLowerCase() || "unknown"}`,
  }),
  async (req, res) => {
  try {
    const { email, username, captchaId, captchaAnswer } = req.body || {};
    if (!email || !EMAIL_RE.test(String(email))) {
      return res.status(400).json({ error: "กรุณากรอกอีเมลให้ถูกต้อง" });
    }
    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      return res.status(400).json({ error: "captcha", message: "รหัสยืนยันภาพไม่ถูกต้อง กรุณาลองใหม่" });
    }

    // Don't email a code for an address/username that's already taken.
    const conds = [eq(usersTable.email, String(email))];
    if (username) conds.push(eq(usersTable.username, String(username)));
    const existing = await db.select().from(usersTable).where(or(...conds)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: "exists", message: "อีเมลหรือชื่อผู้ใช้นี้ถูกใช้งานแล้ว" });
    }

    const wait = resendWait(String(email));
    if (wait > 0) {
      return res.status(429).json({ error: "cooldown", message: `กรุณารอ ${wait} วินาทีก่อนขอรหัสใหม่`, retryAfter: wait });
    }

    const code = createOtp(String(email));
    try {
      await sendMail({
        to: String(email),
        subject: "รหัสยืนยันการสมัครสมาชิก Aquarich",
        html: otpEmailHtml(code),
        text: `รหัสยืนยัน Aquarich ของคุณคือ ${code} (ใช้ได้ภายใน 10 นาที)`,
      });
    } catch (e) {
      return res.status(502).json({ error: "send_failed", message: "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง" });
    }

    // In dev (no SMTP configured) return the code so the flow stays testable.
    const devMode = !mailerConfigured();
    return res.json({ ok: true, devMode, ...(devMode ? { devCode: code } : {}) });
  } catch {
    return res.status(500).json({ error: "Failed to send OTP" });
  }
  },
);

// POST /auth/register — email-OTP verified signup (server sends the code via Brevo).
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, houseNumber, weight, height, phone, email, username, password, role, deviceFingerprint, otp } = req.body;
    // Capture connection details now (req is alive); enrich + log after we respond.
    const session = { ip: clientIp(req), userAgent: req.header("user-agent") || "", fingerprint: typeof deviceFingerprint === "string" ? deviceFingerprint : null };

    if (!firstName || !lastName || !phone || !email || !username || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Email must be verified via OTP before the account is created.
    const otpResult = verifyOtp(String(email), String(otp || ""));
    if (otpResult !== "ok") {
      const msg = otpResult === "expired" ? "รหัส OTP หมดอายุ กรุณาขอรหัสใหม่"
        : otpResult === "locked" ? "กรอกรหัสผิดเกินจำนวนครั้ง กรุณาขอรหัสใหม่"
        : otpResult === "missing" ? "กรุณายืนยันอีเมลด้วยรหัส OTP ก่อน"
        : "รหัส OTP ไม่ถูกต้อง";
      return res.status(400).json({ error: "otp", message: msg });
    }

    // Phone isn't OTP-verified here, but we still store it normalised in phone_e164
    // so members can log in with their number and one phone = one account.
    const phoneE164 = normalizePhone(phone);

    const conds = [eq(usersTable.email, email), eq(usersTable.username, username)];
    if (phoneE164) conds.push(eq(usersTable.phoneE164, phoneE164));
    const existing = await db.select().from(usersTable).where(or(...conds)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: "exists", message: "อีเมล ชื่อผู้ใช้ หรือเบอร์โทรนี้ถูกใช้งานแล้ว" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        firstName, lastName, houseNumber: houseNumber || null, phone,
        phoneE164, phoneVerified: false,
        email, username, passwordHash, role: role || "member",
        weight: weight != null && weight !== "" ? Number(weight) : null,
        height: height != null && height !== "" ? Number(height) : null,
      })
      .returning();

    const allUsers = await db.select().from(usersTable);
    await backupUsers(allUsers);

    const token = signToken({ userId: user.id, username: user.username, role: user.role });

    // New member code created -> set up their personal folder + logs.
    await initMemberFolder(user, "register");
    void logClientSession(user.id, session, "register");

    return res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/login
router.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    keyPrefix: "login",
    key: loginLimitKey,
  }),
  async (req, res) => {
  try {
    const { usernameOrEmail, password, rememberMe, deviceFingerprint } = req.body;
    // Capture connection details now (req is alive); enrich + log after we respond.
    const session = { ip: clientIp(req), userAgent: req.header("user-agent") || "", fingerprint: typeof deviceFingerprint === "string" ? deviceFingerprint : null };

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    // Accept username, email, OR phone number (normalised to E.164) as the identifier.
    const ident = String(usernameOrEmail).trim();
    const identPhone = normalizePhone(ident);
    const conds = [eq(usersTable.email, ident), eq(usersTable.username, ident)];
    if (identPhone) conds.push(eq(usersTable.phoneE164, identPhone));

    const [user] = await db
      .select()
      .from(usersTable)
      .where(or(...conds))
      .limit(1);

    if (!user) {
      await sleep(350);
      await recordAudit({
        req,
        user: null,
        action: "login_failed",
        statusCode: 401,
        targetType: "auth",
        metadata: { identifier: ident, reason: "user_not_found" },
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    let valid = false;
    try {
      valid = await bcrypt.compare(String(password), user.passwordHash);
    } catch {
      valid = false;
    }
    if (!valid) {
      await sleep(350);
      await recordAudit({
        req,
        user: { userId: user.id, username: user.username, role: user.role },
        action: "login_failed",
        statusCode: 401,
        targetType: "auth",
        targetId: user.id,
        metadata: { identifier: ident, reason: "bad_password" },
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, username: user.username, role: user.role }, !!rememberMe);
    clearRateLimit("login", loginLimitKey(req));

    await writeMemberProfile(user);
    void logClientSession(user.id, session, "login");
    await recordAudit({
      req,
      user: { userId: user.id, username: user.username, role: user.role },
      action: "login_success",
      statusCode: 200,
      targetType: "auth",
      targetId: user.id,
      metadata: { rememberMe: !!rememberMe },
    });

    return res.json({ token, user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ error: "Login failed" });
  }
  },
);

// POST /auth/logout
router.post("/logout", (req, res) => {
  return res.json({ message: "Logged out successfully" });
});

// GET /auth/me
router.get("/me", authenticate, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.json(formatUser(user));
  } catch {
    return res.status(500).json({ error: "Failed to get user" });
  }
});

// POST /auth/change-password
router.post("/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both fields are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, req.user!.userId));

    return res.json({ message: "Password changed successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
