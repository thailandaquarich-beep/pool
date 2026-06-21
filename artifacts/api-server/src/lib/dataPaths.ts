import fs from "fs/promises";
import path from "path";

// Single organized root for all persisted customer data + backups.
// Override location with the DATA_DIR env var; defaults to <cwd>/data.
const ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

export const dataDirs = {
  root: ROOT,
  customers: path.join(ROOT, "customers"), // user data backups (JSON)
  members: path.join(ROOT, "members"), // per-member folders (named ART#####) with that member's logs
  slips: path.join(ROOT, "slips"), // payment slips uploaded by members
  usageLogs: path.join(ROOT, "usage-logs"), // actual visit/check-in records per day
  backups: path.join(ROOT, "backups"), // full database snapshots
  chatLogs: path.join(ROOT, "chat-logs"), // น้องอควา AI conversation backups (written by the gateway)
  sales: path.join(ROOT, "sales"), // completed product sales records (revenue backup)
};

export async function ensureDataDirs(): Promise<void> {
  await Promise.all(
    [dataDirs.customers, dataDirs.members, dataDirs.slips, dataDirs.usageLogs, dataDirs.backups, dataDirs.chatLogs, dataDirs.sales].map((d) =>
      fs.mkdir(d, { recursive: true }),
    ),
  );
}
