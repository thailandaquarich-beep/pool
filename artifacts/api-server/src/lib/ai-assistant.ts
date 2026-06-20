// AI auto-reply for the support-chat (live chat) tickets.
// Read-only assistant: answers from the member's real data, hands off to humans when needed.
// Opt-in via env: set AI_CHAT_ENABLED=true (so existing deployments are unaffected unless enabled).
import {
  db,
  usersTable,
  chatTicketsTable,
  chatMessagesTable,
  reservationsTable,
  walletsTable,
  memberPackagesTable,
  membershipPackagesTable,
  settingsTable,
  facilitiesTable,
} from "@workspace/db";
import { eq, and, gte, ne, desc } from "drizzle-orm";

export const AI_CHAT_ENABLED = process.env.AI_CHAT_ENABLED === "true";
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const AI_MODEL = process.env.AI_MODEL || "scb10x/typhoon2.5-qwen3-4b";

const HANDOFF_KEYWORDS = [
  "เจ้าหน้าที่", "พนักงาน", "แอดมิน", "ทีมงาน", "คุยกับคน", "ติดต่อคน",
  "มนุษย์", "admin", "staff", "human", "ร้องเรียน",
];

const SYSTEM_PROMPT =
  'คุณคือ "น้องอควา" (Aqua) ผู้ช่วย AI ของระบบจองสระว่ายน้ำ Aquarich ในแชตสนับสนุน\n' +
  'ภาษา: ตอบเป็นภาษาไทยสุภาพ เป็นผู้หญิง ลงท้าย "ค่ะ" เสมอ (ห้ามใช้ครับ) ถ้าลูกค้าพิมพ์อังกฤษให้ตอบอังกฤษ\n' +
  "หน้าที่: ช่วยเรื่องการจองสระ ยอดเงินกระเป๋า แพ็กเกจ เวลาเปิด-ปิด ครูฝึก และการเติมเงิน\n" +
  "กฎ:\n" +
  "- ใช้ 'ข้อมูลสมาชิก' ด้านล่างเป็นความจริงเท่านั้น ห้ามแต่งข้อมูลขึ้นเอง\n" +
  "- คุณดูข้อมูลได้อย่างเดียว ทำรายการแทนไม่ได้ ถ้าลูกค้าจะจอง/ยกเลิก/เติมเงิน ให้บอกขั้นตอนและชี้ไปเมนูที่ถูกต้อง\n" +
  "- ถ้าเป็นเรื่องที่เกินขอบเขตหรือต้องใช้เจ้าหน้าที่ ให้บอกว่าจะโอนเรื่องให้ทีมงานช่วยต่อ\n" +
  "- กระชับ สุภาพ ไม่เดาข้อมูลที่ไม่มี";

let aiUserIdCache: number | null = null;

// in-memory locks to avoid double-replying when messages arrive close together
const locks = new Set<number>();

export async function getOrCreateAiUser(): Promise<number> {
  if (aiUserIdCache != null) return aiUserIdCache;
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, "ai_assistant")).limit(1);
  if (existing) { aiUserIdCache = existing.id; return existing.id; }
  const [created] = await db.insert(usersTable).values({
    firstName: "น้องอควา",
    lastName: "(ผู้ช่วย AI)",
    houseNumber: "AI",
    phone: "-",
    email: "ai_assistant@aquarich.local",
    username: "ai_assistant",
    passwordHash: "DISABLED_AI_ACCOUNT", // not a valid bcrypt hash → login impossible
    role: "member",
  }).returning({ id: usersTable.id });
  aiUserIdCache = created.id;
  return created.id;
}

function thb(n: unknown): string {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function buildMemberContext(userId: number): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return "ข้อมูลสมาชิก: ไม่พบข้อมูลผู้ใช้";

  const upcoming = await db
    .select()
    .from(reservationsTable)
    .where(and(eq(reservationsTable.userId, userId), gte(reservationsTable.date, today), ne(reservationsTable.status, "cancelled")))
    .orderBy(reservationsTable.date)
    .limit(5);

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);

  const pkgs = await db
    .select({ name: membershipPackagesTable.name, status: memberPackagesTable.status, endDate: memberPackagesTable.endDate })
    .from(memberPackagesTable)
    .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
    .where(and(eq(memberPackagesTable.userId, userId), eq(memberPackagesTable.status, "active")));

  const [settings] = await db.select().from(settingsTable).limit(1);
  const facilities = await db.select().from(facilitiesTable).where(eq(facilitiesTable.isActive, true));

  const lines: string[] = [];
  lines.push(`สมาชิก: ${user.firstName} ${user.lastName} · บ้านเลขที่ ${user.houseNumber}`);
  if (upcoming.length) {
    lines.push("การจองที่จะถึง:");
    for (const r of upcoming)
      lines.push(`  - ${r.date} ${r.startTime}-${r.endTime} · ${r.numberOfPeople} คน · สถานะ ${r.status}` + (r.notes ? ` (${r.notes})` : ""));
  } else lines.push("การจองที่จะถึง: ไม่มี");
  if (wallet) lines.push(`กระเป๋าเงิน: คงเหลือ ${thb(wallet.balance)} บาท`);
  if (pkgs.length) lines.push("แพ็กเกจ (active): " + pkgs.map((p) => `${p.name} (ถึง ${new Date(p.endDate).toISOString().slice(0, 10)})`).join(", "));
  else lines.push("แพ็กเกจ: ไม่มี");
  if (facilities.length) {
    lines.push("สระ/สิ่งอำนวยความสะดวก:");
    for (const f of facilities) lines.push(`  - ${f.name} · เปิด ${f.openTime}-${f.closeTime} · ความจุ ${f.capacity} คน`);
  }
  if (settings) {
    lines.push(`เวลาทำการ ${settings.openTime}-${settings.closeTime} · ราคา/ครั้ง ${thb(settings.bookingPricePerSession)} บาท` +
      (settings.bookingEnabled ? "" : " · ปิดรับจองชั่วคราว") + (settings.maintenanceMode ? " · ปิดปรับปรุง" : ""));
    if (settings.promptpayNumber || settings.bankAccountNumber)
      lines.push(`ชำระเงิน: พร้อมเพย์ ${settings.promptpayNumber ?? "-"} · ${settings.bankName ?? ""} ${settings.bankAccountNumber ?? ""}`.trim());
    if (settings.contactPhone) lines.push(`เบอร์ติดต่อเจ้าหน้าที่: ${settings.contactPhone}`);
  }
  return "ข้อมูลสมาชิก (จากระบบจริง ถือเป็นความจริง):\n" + lines.join("\n");
}

async function callOllama(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, messages, stream: false, options: { temperature: 0.4, top_p: 0.9, num_ctx: 8192 } }),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    return (d.message?.content || "").trim() || null;
  } catch {
    return null;
  }
}

async function insertAiMessage(ticketId: number, text: string, aiUserId: number, status: "open" | "in_progress") {
  await db.insert(chatMessagesTable).values({ ticketId, senderId: aiUserId, message: text, isAdminMessage: true });
  await db.update(chatTicketsTable).set({ updatedAt: new Date(), status }).where(eq(chatTicketsTable.id, ticketId));
}

// Called (fire-and-forget) after a MEMBER posts a message or opens a ticket.
export async function maybeAiReply(ticketId: number): Promise<void> {
  if (!AI_CHAT_ENABLED || locks.has(ticketId)) return;
  locks.add(ticketId);
  try {
    const aiUserId = await getOrCreateAiUser();
    const [ticket] = await db.select().from(chatTicketsTable).where(eq(chatTicketsTable.id, ticketId)).limit(1);
    if (!ticket || ticket.status === "closed" || ticket.status === "resolved") return;

    const msgs = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.ticketId, ticketId)).orderBy(chatMessagesTable.createdAt);
    if (!msgs.length) return;

    // If a real human staff member has joined, stay silent (human owns the conversation).
    const humanJoined = msgs.some((m) => m.isAdminMessage && m.senderId !== aiUserId);
    if (humanJoined) return;

    const last = msgs[msgs.length - 1];
    if (last.isAdminMessage) return; // only respond to the member's latest message

    // Handoff: member asks for a human / complaint -> notify and stop.
    const lower = (last.message || "").toLowerCase();
    if (HANDOFF_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))) {
      await insertAiMessage(ticketId, "รับเรื่องแล้วค่ะ 🙏 น้องอควากำลังโอนให้เจ้าหน้าที่เข้ามาดูแลต่อนะคะ กรุณารอสักครู่ค่ะ", aiUserId, "in_progress");
      return;
    }

    const context = await buildMemberContext(ticket.userId);
    const history = msgs.slice(-10).map((m) => ({ role: m.isAdminMessage ? "assistant" : "user", content: m.message || "" }));
    const reply = await callOllama([{ role: "system", content: SYSTEM_PROMPT + "\n\n" + context }, ...history]);
    if (reply) await insertAiMessage(ticketId, reply, aiUserId, "in_progress");
  } catch {
    // swallow — AI failure must never break the chat
  } finally {
    locks.delete(ticketId);
  }
}
