import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authenticate, requireSuperAdmin } from "../middlewares/auth.js";
import { backupEncryptionStatus, getBackupFilePath, listBackupFiles, readBackupFile, runFullBackup, listFullBackups } from "../lib/backup.js";
import { dataDirs } from "../lib/dataPaths.js";
import { readEncryptedFile } from "../lib/cryptoVault.js";

const router = Router();

router.use(authenticate, requireSuperAdmin);

router.get("/security-status", (_req, res) => {
  return res.json({ backupEncryption: backupEncryptionStatus() });
});

// POST /backup/run-full — snapshot all customer data to data/backups/
router.post("/run-full", async (_req, res) => {
  try {
    const result = await runFullBackup();
    return res.json({ message: "Full backup created", ...result });
  } catch {
    return res.status(500).json({ error: "Failed to run full backup" });
  }
});

// GET /backup/full — list full backup snapshots
router.get("/full", async (_req, res) => {
  try {
    return res.json({ files: await listFullBackups() });
  } catch {
    return res.status(500).json({ error: "Failed to list full backups" });
  }
});

// GET /backup/usage-logs — list daily usage/visit log files
router.get("/usage-logs", async (_req, res) => {
  try {
    await fs.mkdir(dataDirs.usageLogs, { recursive: true });
    const names = (await fs.readdir(dataDirs.usageLogs)).filter((f) => f.endsWith(".jsonl.enc")).sort((a, b) => b.localeCompare(a));
    const files = await Promise.all(
      names.map(async (name) => {
        const st = await fs.stat(path.join(dataDirs.usageLogs, name));
        const text = await readEncryptedFile(path.join(dataDirs.usageLogs, name.replace(/\.enc$/, "")));
        return { name, size: st.size, entries: text.split("\n").filter(Boolean).length };
      }),
    );
    return res.json({ files });
  } catch {
    return res.status(500).json({ error: "Failed to list usage logs" });
  }
});

// GET /backup/usage-logs/:filename — download a usage log file
router.get("/usage-logs/:filename", async (req, res) => {
  try {
    const safe = path.basename(req.params.filename);
    const filePath = path.join(dataDirs.usageLogs, safe);
    await fs.access(filePath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Encrypted-Backup", "aes-256-gcm");
    return res.download(filePath, safe);
  } catch {
    return res.status(404).json({ error: "Usage log not found" });
  }
});

router.get("/users", async (_req, res) => {
  try {
    const files = await listBackupFiles();
    return res.json({ files });
  } catch {
    return res.status(500).json({ error: "Failed to list backup files" });
  }
});

router.get("/users/download/:filename", async (req, res) => {
  try {
    const filePath = await getBackupFilePath(req.params.filename);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Encrypted-Backup", "aes-256-gcm");
    return res.download(filePath, path.basename(filePath));
  } catch {
    return res.status(404).json({ error: "Backup file not found" });
  }
});

router.get("/users/latest", async (_req, res) => {
  try {
    const files = await listBackupFiles();
    if (files.length === 0) {
      return res.status(404).json({ error: "No backup files available" });
    }

    const filePath = await getBackupFilePath(files[0]);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Encrypted-Backup", "aes-256-gcm");
    return res.download(filePath, path.basename(filePath));
  } catch {
    return res.status(500).json({ error: "Failed to download latest backup" });
  }
});

router.get("/users/decrypted/:filename", async (req, res) => {
  try {
    const backup = await readBackupFile(req.params.filename);
    return res.json(backup);
  } catch {
    return res.status(404).json({ error: "Backup file not found or cannot be decrypted" });
  }
});

router.post("/users/restore", async (req, res) => {
  try {
    const filename = req.body.filename as string | undefined;
    if (!filename) {
      return res.status(400).json({ error: "filename is required" });
    }

    const backup = await readBackupFile(filename);
    const restoredUsers = [];

    for (const user of backup.users) {
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

      const values = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        houseNumber: user.houseNumber,
        phone: user.phone,
        email: user.email,
        username: user.username,
        passwordHash: user.passwordHash,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
        createdAt: new Date(user.createdAt),
      };

      if (existing) {
        const [updated] = await db.update(usersTable).set(values).where(eq(usersTable.id, user.id)).returning();
        restoredUsers.push(updated);
      } else {
        const [inserted] = await db.insert(usersTable).values(values).returning();
        restoredUsers.push(inserted);
      }
    }

    return res.json({ restored: restoredUsers.length });
  } catch (error) {
    return res.status(500).json({ error: "Failed to restore from backup" });
  }
});

export default router;
