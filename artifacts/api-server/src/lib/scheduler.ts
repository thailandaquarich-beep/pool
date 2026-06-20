import fs from "fs/promises";
import path from "path";
import { dataDirs } from "./dataPaths.js";
import { runFullBackup } from "./backup.js";
import { logger } from "./logger.js";

const BKK = "Asia/Bangkok";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BKK, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: BKK, hour: "2-digit", hourCycle: "h23" });

const BACKUP_HOUR = Number(process.env.BACKUP_HOUR ?? 2); // run after 02:00 Bangkok
const KEEP = Number(process.env.BACKUP_KEEP ?? 30); // keep newest N full snapshots
const markerPath = path.join(dataDirs.backups, ".last-daily");

// Keep only the newest KEEP full backups (usage logs + customer backups are never pruned).
async function pruneOldBackups(): Promise<void> {
  try {
    const files = (await fs.readdir(dataDirs.backups))
      .filter((f) => f.startsWith("full-backup-") && f.endsWith(".json"))
      .sort(); // ISO timestamps sort chronologically
    const excess = files.slice(0, Math.max(0, files.length - KEEP));
    await Promise.all(excess.map((f) => fs.rm(path.join(dataDirs.backups, f), { force: true })));
  } catch {
    /* pruning is best-effort */
  }
}

// Runs at most once per Bangkok-day. If the server was down at 02:00, the next tick
// after the server comes up (and past BACKUP_HOUR) catches up automatically.
async function tick(): Promise<void> {
  try {
    const now = new Date();
    const today = dayFmt.format(now);
    const hour = Number(hourFmt.format(now));

    let last = "";
    try {
      last = (await fs.readFile(markerPath, "utf-8")).trim();
    } catch {
      /* no marker yet */
    }

    if (last !== today && hour >= BACKUP_HOUR) {
      const result = await runFullBackup();
      await fs.writeFile(markerPath, today, "utf-8");
      await pruneOldBackups();
      logger.info({ file: result.file, counts: result.counts }, "Daily backup completed");
    }
  } catch (err) {
    logger.error({ err }, "Daily backup tick failed");
  }
}

export function startDailyBackup(): void {
  setTimeout(() => void tick(), 10_000); // first check shortly after startup (catch-up)
  setInterval(() => void tick(), 30 * 60 * 1000); // then every 30 minutes
  logger.info({ backupHour: BACKUP_HOUR, keep: KEEP }, "Daily backup scheduler started");
}
