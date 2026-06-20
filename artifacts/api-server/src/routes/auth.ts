import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middlewares/auth.js";
import { backupUsers } from "../lib/backup.js";
import { memberCode } from "../lib/memberCode.js";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return { ...rest, memberCode: memberCode(user.id), createdAt: rest.createdAt.toISOString() };
}

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, houseNumber, weight, height, phone, email, username, password, role } = req.body;

    if (!firstName || !lastName || !phone || !email || !username || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, email), eq(usersTable.username, username)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email or username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        firstName, lastName, houseNumber: houseNumber || null, phone, email, username, passwordHash, role: role || "member",
        weight: weight != null && weight !== "" ? Number(weight) : null,
        height: height != null && height !== "" ? Number(height) : null,
      })
      .returning();

    const allUsers = await db.select().from(usersTable);
    await backupUsers(allUsers);

    const token = signToken({ userId: user.id, username: user.username, role: user.role });

    return res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { usernameOrEmail, password, rememberMe } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, usernameOrEmail), eq(usersTable.username, usernameOrEmail)))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, username: user.username, role: user.role }, !!rememberMe);

    return res.json({ token, user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ error: "Login failed" });
  }
});

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
