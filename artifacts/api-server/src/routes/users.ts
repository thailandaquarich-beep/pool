import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, memberPackagesTable, membershipPackagesTable } from "@workspace/db";
import { eq, or, ilike, sql, and, inArray } from "drizzle-orm";
import { authenticate, requireAdmin, isAdminRole } from "../middlewares/auth.js";
import { backupUsers, formatBackupUser } from "../lib/backup.js";
import { memberCode } from "../lib/memberCode.js";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return { ...rest, memberCode: memberCode(user.id), createdAt: rest.createdAt.toISOString() };
}

// GET /users — admin only
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    let query = db.select().from(usersTable);

    if (search) {
      query = query.where(
        or(
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.username, `%${search}%`),
          ilike(usersTable.houseNumber, `%${search}%`)
        )
      ) as typeof query;
    }

    // Ordered by id ascending so member numbers (ART00001, ART00002, …) appear in order.
    const users = await query.orderBy(usersTable.id).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);

    // Enrich each user with their active package's remaining uses + days left.
    const ids = users.map((u) => u.id);
    const pkgRows = ids.length
      ? await db
          .select({ mp: memberPackagesTable, pkg: membershipPackagesTable })
          .from(memberPackagesTable)
          .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
          .where(and(inArray(memberPackagesTable.userId, ids), eq(memberPackagesTable.status, "active")))
      : [];

    const now = Date.now();
    const byUser = new Map<number, { remaining: number | null; endDate: Date; name: string }>();
    for (const { mp, pkg } of pkgRows) {
      const end = new Date(mp.endDate);
      if (end.getTime() <= now) continue; // skip expired
      const quota = pkg.maxBookingsPerMonth ?? null;
      const remaining = quota === null ? null : Math.max(0, quota - mp.bookingsUsed);
      const existing = byUser.get(mp.userId);
      // keep the soonest-expiring active package
      if (!existing || end < existing.endDate) {
        byUser.set(mp.userId, { remaining, endDate: end, name: pkg.name });
      }
    }

    return res.json({
      users: users.map((u) => {
        const p = byUser.get(u.id);
        return {
          ...formatUser(u),
          hasActivePackage: !!p,
          packageName: p ? p.name : null,
          packageRemaining: p ? p.remaining : null,
          packageDaysLeft: p ? Math.max(0, Math.ceil((p.endDate.getTime() - now) / 86400000)) : null,
        };
      }),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch {
    return res.status(500).json({ error: "Failed to list users" });
  }
});

// POST /users — admin only
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, houseNumber, weight, height, phone, email, username, password, role } = req.body;

    const existing = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, email), eq(usersTable.username, username)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email or username already exists" });
    }

    const passwordHash = await bcrypt.hash(password || "changeme123", 12);
    const [user] = await db
      .insert(usersTable)
      .values({
        firstName, lastName, houseNumber: houseNumber || null, phone, email, username, passwordHash, role: role || "member",
        weight: weight != null && weight !== "" ? Number(weight) : null,
        height: height != null && height !== "" ? Number(height) : null,
      })
      .returning();

    const users = await db.select().from(usersTable);
    await backupUsers(users);

    return res.status(201).json(formatUser(user));
  } catch {
    return res.status(500).json({ error: "Failed to create user" });
  }
});

// GET /users/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isAdminRole(req.user!.role) && req.user!.userId !== id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json(formatUser(user));
  } catch {
    return res.status(500).json({ error: "Failed to get user" });
  }
});

// PATCH /users/:id
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isAdminRole(req.user!.role) && req.user!.userId !== id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { firstName, lastName, houseNumber, weight, height, phone, email, role, profileImageUrl } = req.body;
    const updates: Partial<typeof usersTable.$inferInsert> = {};

    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (houseNumber !== undefined) updates.houseNumber = houseNumber || null;
    if (weight !== undefined) updates.weight = weight === "" || weight === null ? null : Number(weight);
    if (height !== undefined) updates.height = height === "" || height === null ? null : Number(height);
    if (phone) updates.phone = phone;
    if (email) updates.email = email;
    if (role && isAdminRole(req.user!.role)) updates.role = role;
    if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "User not found" });

    const users = await db.select().from(usersTable);
    await backupUsers(users);

    return res.json(formatUser(user));
  } catch {
    return res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /users/:id — admin only
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    const users = await db.select().from(usersTable);
    await backupUsers(users);
    return res.json({ message: "User deleted" });
  } catch {
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

// POST /users/:id/reset-password — admin only
router.post("/:id/reset-password", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ error: "New password is required" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id));

    return res.json({ message: "Password reset successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
