import fs from "fs/promises";
import path from "path";
import { dataDirs } from "./dataPaths.js";
import { memberCode } from "./memberCode.js";

// Per-member data folders: data/members/<ART#####>/
//   profile.json      — basic member info (refreshed on login / check-in)
//   checkins.jsonl    — check-in / visit records
//   activity.jsonl    — web usage actions (login, booking, purchase, top-up, order, ...)
//   ai-chat.jsonl     — conversations with น้องอควา (AI assistant)
//   admin-chat.jsonl  — support-ticket messages with admin (both directions)
// Every write is best-effort and never throws — logging must not break a request.

export type MemberLogKind = "checkins" | "activity" | "ai-chat" | "admin-chat";

const BKK = "Asia/Bangkok";

function folderFor(userId: number, code?: string): string {
  return path.join(dataDirs.members, code || memberCode(userId));
}

export async function appendMemberLog(
  who: { userId: number; memberCode?: string },
  kind: MemberLogKind,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const now = new Date();
    const dir = folderFor(who.userId, who.memberCode);
    await fs.mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      at: now.toISOString(),
      atLocal: now.toLocaleString("th-TH", { timeZone: BKK, hour12: false }),
      ...payload,
    }) + "\n";
    await fs.appendFile(path.join(dir, `${kind}.jsonl`), line, "utf-8");
  } catch {
    /* best-effort */
  }
}

export async function writeMemberProfile(u: {
  id: number;
  firstName: string;
  lastName: string;
  houseNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  weight?: number | null;
  height?: number | null;
  profileImageUrl?: string | null;
  createdAt?: Date | string | null;
}): Promise<void> {
  try {
    const dir = folderFor(u.id);
    await fs.mkdir(dir, { recursive: true });
    const profile = {
      memberCode: memberCode(u.id),
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      name: `${u.firstName} ${u.lastName}`.trim(),
      houseNumber: u.houseNumber ?? null,
      phone: u.phone ?? null,
      email: u.email ?? null,
      username: u.username ?? null,
      role: u.role ?? null,
      weight: u.weight ?? null,
      height: u.height ?? null,
      profileImageUrl: u.profileImageUrl ?? null,
      registeredAt: u.createdAt ? (u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt)) : null,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(dir, "profile.json"), JSON.stringify(profile, null, 2), "utf-8");
  } catch {
    /* best-effort */
  }
}

// Initialise a brand-new member's folder the moment their code is created
// (registration, admin-created member, instructor account). Writes the full
// profile + an "account created" line in activity.jsonl.
export async function initMemberFolder(
  u: Parameters<typeof writeMemberProfile>[0],
  via: "register" | "admin_create" | "instructor_account",
): Promise<void> {
  await writeMemberProfile(u);
  await appendMemberLog({ userId: u.id }, "activity", {
    action: "account_created", via, memberCode: memberCode(u.id), role: u.role ?? null,
  });
}
