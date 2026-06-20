import fs from "fs/promises";
import path from "path";
import { dataDirs } from "./dataPaths.js";

export type UsageLogEntry = {
  userId: number;
  memberCode?: string;
  name?: string;
  source: "booking" | "checkin";
  packageName?: string | null;
  detail?: string;
};

const BKK = "Asia/Bangkok";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BKK, year: "numeric", month: "2-digit", day: "2-digit" });

// Append one line recording an actual usage/visit. One file per day (Bangkok time),
// JSON Lines so it is both human-readable and easy to import. Never throws — a logging
// failure must not break the check-in / booking flow.
export async function logUsage(entry: UsageLogEntry): Promise<void> {
  try {
    const now = new Date();
    const dayKey = dayFmt.format(now); // YYYY-MM-DD (Bangkok)
    const atLocal = now.toLocaleString("th-TH", { timeZone: BKK, hour12: false });
    const line = JSON.stringify({ at: now.toISOString(), atLocal, ...entry }) + "\n";
    await fs.mkdir(dataDirs.usageLogs, { recursive: true });
    await fs.appendFile(path.join(dataDirs.usageLogs, `usage-${dayKey}.jsonl`), line, "utf-8");
  } catch {
    /* swallow — logging is best-effort */
  }
}
