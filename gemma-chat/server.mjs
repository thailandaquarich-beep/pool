// Aquarich AI gateway (read-only).
// Streams Thai answers from Typhoon, grounded in the member's REAL data pulled live
// from the Aquarich API (:5000) using the member's own JWT (pool_token).
// Run:  node gemma-chat/server.mjs   ->  test console at http://127.0.0.1:8787
import { createServer } from "node:http";
import { readFile, mkdir, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const API = process.env.API_BASE || "http://127.0.0.1:5000/api"; // Aquarich backend
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = process.env.ADMIN_KEY || "admin";
const MODEL = process.env.MODEL || "scb10x/typhoon2.5-qwen3-4b";
const GEN_OPTIONS = { num_ctx: 8192, temperature: 0.4, top_p: 0.9, repeat_penalty: 1.05 };
// Conversations are backed up here (shared with the Aquarich data folder so they're
// included in backups and readable by the admin analytics API).
const CHAT_LOG_DIR = process.env.CHAT_LOG_DIR || join(__dir, "..", "artifacts", "api-server", "data", "chat-logs");

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });

// Lightweight intent classification (keyword-based) to organize what customers want.
function detectIntent(text) {
  const t = String(text || "").toLowerCase();
  const has = (...arr) => arr.some((k) => t.includes(k));
  if (has("เจ้าหน้าที่", "พนักงาน", "คนจริง", "แอดมิน", "human", "agent", "ติดต่อทีม")) return "human_request";
  if (has("ร้องเรียน", "ไม่พอใจ", "แย่", "complain", "เสีย", "พัง", "ปัญหา", "โกง")) return "complaint";
  if (has("ยกเลิก", "cancel", "คืนเงิน", "refund")) return "cancel";
  if (has("เติมเงิน", "เติม vc", "topup", "top up", "สลิป", "โอนเงิน")) return "topup";
  if (has("จอง", "book", "คิว", "ลงเวลา", "reserve")) return "booking";
  if (has("แพ็กเกจ", "package", "สมาชิก", "membership")) return "package";
  if (has("ครูฝึก", "โค้ช", "coach", "instructor")) return "instructor";
  if (has("เวลา", "กี่โมง", "เปิด", "ปิด", "hours")) return "hours";
  if (has("ราคา", "ค่าบริการ", "price", "กี่บาท")) return "price";
  return "general";
}

// Escalate to a human when the request is a complaint / explicit human request,
// or the assistant itself defers to staff.
function needsEscalation(intent, reply) {
  if (intent === "human_request" || intent === "complaint" || intent === "cancel") return true;
  const r = String(reply || "");
  return r.includes("ติดต่อเจ้าหน้าที่") || r.includes("ตั๋วสนับสนุน") || r.includes("ไม่สามารถช่วย");
}

// Append one conversation turn to the daily log + a per-customer file. Best-effort.
async function logChat(entry) {
  try {
    await mkdir(CHAT_LOG_DIR, { recursive: true });
    const now = new Date();
    const line = JSON.stringify({ at: now.toISOString(), atLocal: now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false }), ...entry }) + "\n";
    await appendFile(join(CHAT_LOG_DIR, `chat-${dayFmt.format(now)}.jsonl`), line, "utf-8");
    await mkdir(join(CHAT_LOG_DIR, "users"), { recursive: true });
    await appendFile(join(CHAT_LOG_DIR, "users", `${entry.userId != null ? entry.userId : "anonymous"}.jsonl`), line, "utf-8");
  } catch { /* logging must never break chat */ }
}

const state = {
  chatEnabled: true,
  modelOn: true,
  system:
    'คุณคือ "น้องอควา" (Aqua) ผู้ช่วยของระบบจองสระว่ายน้ำ Aquarich\n' +
    "ภาษา: ตอบเป็นภาษาไทยสุภาพ เป็นผู้หญิง ลงท้าย \"ค่ะ\" เสมอ (ห้ามใช้ครับ) — ถ้าลูกค้าพิมพ์ภาษาอังกฤษ ให้ตอบอังกฤษ\n" +
    "หน้าที่: ช่วยสมาชิกเรื่องการจองสระ ยอดเงินกระเป๋า แพ็กเกจ เวลาเปิด-ปิด ครูฝึก และการเติมเงิน\n" +
    "กฎสำคัญ:\n" +
    "- ใช้ 'ข้อมูลสมาชิก' ด้านล่างเป็นความจริงเท่านั้น ห้ามแต่งการจอง/ยอดเงิน/แพ็กเกจขึ้นเอง\n" +
    "- คุณดูข้อมูลได้อย่างเดียว ทำรายการแทนไม่ได้ ถ้าลูกค้าต้องการจอง/ยกเลิก/เติมเงิน ให้บอกขั้นตอนและชี้ไปที่เมนูที่ถูกต้อง\n" +
    "- เรื่องชำระเงิน ให้แนะนำพร้อมเพย์/บัญชีจาก 'การตั้งค่า' ไม่ขอข้อมูลบัตรเครดิต\n" +
    "- เรื่องร้องเรียนหรือต้องให้เจ้าหน้าที่ช่วย ให้แนะนำเปิด 'ตั๋วสนับสนุน' ถึงทีมงาน\n" +
    "- ระบุวันที่/เวลา/จำนวนคนให้ชัดทุกครั้งที่พูดถึงการจอง\n" +
    "- กระชับ สุภาพ เป็นกันเอง ไม่เดาข้อมูลที่ไม่มี",
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-admin-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (res, code, obj) =>
  (res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...CORS }),
  res.end(JSON.stringify(obj)));
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => ((d += c), d.length > 1e6 && req.destroy()));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
const isAdmin = (req) => (req.headers["x-admin-key"] || "") === ADMIN_KEY;
const publicState = () => ({ chatEnabled: state.chatEnabled, model: MODEL, modelOn: state.modelOn });

// ---- pull the member's real data from the Aquarich API with their JWT ----
async function apiGet(path, token) {
  try {
    const r = await fetch(API + path, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
function thb(n) { return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function buildContext(token) {
  if (!token) return { text: "ข้อมูลสมาชิก: ผู้ใช้ยังไม่ได้เข้าสู่ระบบ — ตอบได้เฉพาะข้อมูลทั่วไป และเชิญให้เข้าสู่ระบบ", me: null };
  const [me, upcoming, wallet, packages, settings, facilities] = await Promise.all([
    apiGet("/auth/me", token),
    apiGet("/reservations/upcoming", token),
    apiGet("/wallet/me", token),
    apiGet("/packages/my", token),
    apiGet("/settings", token),
    apiGet("/facilities", token),
  ]);
  if (!me) return { text: "ข้อมูลสมาชิก: โทเคนไม่ถูกต้องหรือหมดอายุ — เชิญให้เข้าสู่ระบบใหม่", me: null };

  const lines = [];
  lines.push(`สมาชิก: ${me.firstName} ${me.lastName} · บ้านเลขที่ ${me.houseNumber ?? "-"} (สิทธิ์: ${me.role})`);

  if (Array.isArray(upcoming) && upcoming.length) {
    lines.push("การจองที่จะถึง:");
    for (const r of upcoming)
      lines.push(`  - ${r.date} ${r.startTime}-${r.endTime} · ${r.numberOfPeople} คน · สถานะ ${r.status}` +
        (r.notes ? ` (${r.notes})` : ""));
  } else lines.push("การจองที่จะถึง: ไม่มี");

  if (wallet) lines.push(`กระเป๋าเงิน: คงเหลือ ${thb(wallet.balance)} บาท`);

  if (Array.isArray(packages) && packages.length) {
    lines.push("แพ็กเกจของฉัน:");
    for (const p of packages)
      lines.push(`  - ${p.package?.name ?? "-"} · สถานะ ${p.isExpired ? "หมดอายุ" : p.status}` +
        (p.endDate ? ` · ถึง ${String(p.endDate).slice(0, 10)}` : ""));
  } else lines.push("แพ็กเกจของฉัน: ไม่มี");

  if (Array.isArray(facilities) && facilities.length) {
    lines.push("สระ/สิ่งอำนวยความสะดวก:");
    for (const f of facilities)
      lines.push(`  - ${f.name} · เปิด ${f.openTime}-${f.closeTime} · ความจุ ${f.capacity} คน`);
  }
  if (settings) {
    lines.push(
      `การตั้งค่า: เวลาทำการ ${settings.openTime}-${settings.closeTime} · ราคา/ครั้ง ${settings.bookingPricePerSession ?? "-"} บาท` +
      (settings.bookingEnabled === false ? " · ปิดรับจองชั่วคราว" : "") +
      (settings.maintenanceMode ? " · อยู่ระหว่างปิดปรับปรุง" : "")
    );
    if (settings.promptpayNumber || settings.bankAccountNumber)
      lines.push(`ช่องทางชำระเงิน: พร้อมเพย์ ${settings.promptpayNumber ?? "-"} · ${settings.bankName ?? ""} ${settings.bankAccountNumber ?? ""} (${settings.bankAccountName ?? ""})`);
    if (settings.contactPhone) lines.push(`ติดต่อเจ้าหน้าที่: ${settings.contactPhone}`);
  }
  return { text: "ข้อมูลสมาชิก (จากระบบจริง ถือเป็นความจริง):\n" + lines.join("\n"), me };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return (res.writeHead(204, CORS), res.end());
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(join(__dir, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...CORS });
      return res.end(html);
    }
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, publicState());

    if (req.method === "POST" && url.pathname === "/api/admin") {
      if (!isAdmin(req)) return json(res, 401, { error: "bad admin key" });
      const b = await readBody(req);
      if (typeof b.chatEnabled === "boolean") state.chatEnabled = b.chatEnabled;
      if (typeof b.modelOn === "boolean") state.modelOn = b.modelOn;
      if (typeof b.system === "string" && b.system.trim()) state.system = b.system.trim();
      return json(res, 200, publicState());
    }

    if (req.method === "POST" && url.pathname === "/api/assistant") {
      const b = await readBody(req);
      if (!state.chatEnabled) return json(res, 503, { error: "ผู้ช่วยถูกปิดใช้งานชั่วคราว" });
      if (!state.modelOn) return json(res, 503, { error: "โมเดลถูกปิดใช้งานโดยผู้ดูแล" });

      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const ctx = await buildContext(token); // <-- real member data via JWT
      const userBlock = ctx.text;
      const me = ctx.me;
      const userMsg = String(b.message || "").slice(0, 4000);
      const intent = detectIntent(userMsg);
      const history = Array.isArray(b.history) ? b.history.slice(-20) : [];
      const messages = [
        { role: "system", content: state.system + "\n\n" + userBlock },
        ...history,
        { role: "user", content: userMsg },
      ];

      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", ...CORS });
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);

      let upstream;
      try {
        upstream = await fetch(`${OLLAMA}/api/chat`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: MODEL, messages, stream: true, options: GEN_OPTIONS }),
        });
      } catch (e) { send({ error: "เชื่อมต่อ Ollama ไม่ได้: " + e.message }); return res.end(); }
      if (!upstream.ok || !upstream.body) { send({ error: `Ollama ${upstream.status}` }); return res.end(); }

      let buf = "", acc = ""; const dec = new TextDecoder();
      req.on("close", () => { try { upstream.body.cancel(); } catch {} });
      for await (const chunk of upstream.body) {
        buf += dec.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let o; try { o = JSON.parse(line); } catch { continue; }
          if (o.message?.content) { acc += o.message.content; send({ t: o.message.content }); }
          if (o.done) send({ done: true, tps: o.eval_count && o.eval_duration ? +(o.eval_count / (o.eval_duration / 1e9)).toFixed(1) : null });
        }
      }

      // Decide escalation, signal the widget, and back up the conversation.
      const escalate = needsEscalation(intent, acc);
      if (escalate) send({ escalate: true });
      await logChat({
        userId: me?.id ?? null,
        memberCode: me?.memberCode ?? null,
        name: me ? `${me.firstName} ${me.lastName}` : null,
        role: me?.role ?? "guest",
        intent,
        escalated: escalate,
        message: userMsg.slice(0, 2000),
        reply: acc.slice(0, 4000),
      });
      return res.end();
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String(e?.message || e) });
    else res.end();
  }
});

server.listen(PORT, () =>
  console.log(`Aquarich AI gateway on http://127.0.0.1:${PORT}  (API=${API}, model=${MODEL}, admin key "${ADMIN_KEY}")`)
);
