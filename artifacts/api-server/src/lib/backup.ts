import fs from "fs/promises";
import path from "path";
import { type User } from "@workspace/db";
import { dataDirs } from "./dataPaths.js";

const backupRoot = dataDirs.customers;
const latestBackupPath = path.join(backupRoot, "latest-users-backup.json");

export type BackupUser = Omit<User, "createdAt"> & {
  createdAt: string;
};

export async function ensureBackupFolder(): Promise<void> {
  await fs.mkdir(backupRoot, { recursive: true });
}

export function formatBackupUser(user: User): BackupUser {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function backupUsers(users: User[]): Promise<void> {
  await ensureBackupFolder();

  const backupUsers = users.map(formatBackupUser);
  const payload = {
    createdAt: new Date().toISOString(),
    count: backupUsers.length,
    users: backupUsers,
  };

  const json = JSON.stringify(payload, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupRoot, `users-backup-${timestamp}.json`);

  await fs.writeFile(backupFile, json, "utf-8");
  await fs.writeFile(latestBackupPath, json, "utf-8");
}

export async function listBackupFiles(): Promise<string[]> {
  await ensureBackupFolder();
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

export async function getBackupFilePath(filename: string): Promise<string> {
  const safeName = path.basename(filename);
  const filePath = path.join(backupRoot, safeName);
  await fs.access(filePath);
  return filePath;
}

export async function readBackupFile(filename: string): Promise<{ users: BackupUser[] }> {
  const filePath = await getBackupFilePath(filename);
  const text = await fs.readFile(filePath, "utf-8");
  return JSON.parse(text) as { users: BackupUser[] };
}

// Comprehensive snapshot of EVERY table into a dated folder (one tidy file per table)
// plus a manifest and a combined "latest" file. To back up a new system, add one line
// to the TABLES registry below — nothing else to change.
export async function runFullBackup(): Promise<{ file: string; counts: Record<string, number> }> {
  const m: any = await import("@workspace/db");
  const db = m.db;

  const TABLES: Record<string, any> = {
    users: m.usersTable,
    instructors: m.instructorsTable,
    instructor_availability: m.instructorAvailabilityTable,
    reservations: m.reservationsTable,
    settings: m.settingsTable,
    facilities: m.facilitiesTable,
    announcements: m.announcementsTable,
    wallets: m.walletsTable,
    transactions: m.transactionsTable,
    topup_requests: m.topupRequestsTable,
    membership_packages: m.membershipPackagesTable,
    member_packages: m.memberPackagesTable,
    package_usages: m.packageUsagesTable,
    products: m.productsTable,
    orders: m.ordersTable,
    chat_tickets: m.chatTicketsTable,
    chat_messages: m.chatMessagesTable,
  };

  const createdAt = new Date().toISOString();
  const ts = createdAt.replace(/[:.]/g, "-");
  const folder = path.join(dataDirs.backups, ts); // data/backups/<timestamp>/
  await fs.mkdir(folder, { recursive: true });

  const counts: Record<string, number> = {};
  const combined: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    if (!table) continue; // table not present in this build — skip gracefully
    const rows = await db.select().from(table);
    counts[name] = rows.length;
    combined[name] = rows;
    await fs.writeFile(path.join(folder, `${name}.json`), JSON.stringify(rows, null, 2), "utf-8");
  }

  await fs.writeFile(path.join(folder, "manifest.json"), JSON.stringify({ createdAt, counts }, null, 2), "utf-8");
  // combined "latest" snapshot for quick download / backward compatibility
  await fs.writeFile(
    path.join(dataDirs.backups, "latest-full-backup.json"),
    JSON.stringify({ createdAt, counts, tables: combined }, null, 2),
    "utf-8",
  );

  return { file: ts, counts };
}

export async function listFullBackups(): Promise<string[]> {
  await fs.mkdir(dataDirs.backups, { recursive: true });
  const entries = await fs.readdir(dataDirs.backups);
  return entries.filter((f) => f.endsWith(".json")).sort((a, b) => b.localeCompare(a));
}
