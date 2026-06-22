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
    "หน้าที่: ช่วยสมาชิกเรื่องการจองสระ ยอดเงินกระเป๋า แพ็กเกจ เวลาเปิด-ปิด ครูฝึก สินค้า สถานที่ และการเติมเงิน\n" +
    "ความสามารถ: คุณช่วย 'ทำให้' ได้จริง — จองสระแทน (ระบุวัน-เวลา-ครู), พาไปหน้าต่างๆ เช่นเติมเงิน/แพ็กเกจ/ร้านค้า ระบบจะทำให้อัตโนมัติ\n" +
    "กฎสำคัญ:\n" +
    "- ใช้ 'ข้อมูลระบบจริง' ด้านล่างเป็นความจริงเท่านั้น ห้ามแต่งการจอง/ยอดเงิน/แพ็กเกจ/ตารางครูขึ้นเอง\n" +
    "- การ 'เติมเงิน' คุณทำให้เองไม่ได้ ทำได้แค่พาไปหน้าเติมเงิน แล้วให้ลูกค้าทำเอง\n" +
    "- เรื่องครูฝึก/วันนี้มีครูไหม/ครูลงวันไหน ให้ตอบจากข้อมูลตารางครูด้านล่าง\n" +
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

const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

async function buildContext(token) {
  const today = dayFmt.format(new Date());
  if (!token) return { text: `วันนี้คือ ${today}\nข้อมูลสมาชิก: ผู้ใช้ยังไม่ได้เข้าสู่ระบบ — ตอบได้เฉพาะข้อมูลทั่วไป และเชิญให้เข้าสู่ระบบ`, me: null, instructors: [] };
  const [me, upcoming, wallet, packages, settings, facilities, instructors, today2, products] = await Promise.all([
    apiGet("/auth/me", token),
    apiGet("/reservations/upcoming", token),
    apiGet("/wallet/me", token),
    apiGet("/packages/my", token),
    apiGet("/settings", token),
    apiGet("/facilities", token),
    apiGet("/instructors", token),
    apiGet("/instructors/today", token),
    apiGet("/products", token),
  ]);
  if (!me) return { text: "ข้อมูลสมาชิก: โทเคนไม่ถูกต้องหรือหมดอายุ — เชิญให้เข้าสู่ระบบใหม่", me: null, instructors: [] };

  // Each instructor's weekly/date availability (a few calls, in parallel) so the assistant
  // can answer "ครู X ลงวันไหน".
  const instrList = Array.isArray(instructors) ? instructors.slice(0, 8) : [];
  const avails = await Promise.all(instrList.map((i) => apiGet(`/instructors/${i.id}/availability`, token)));

  const lines = [];
  lines.push(`วันนี้คือ ${today} (เขตเวลาไทย)`);
  lines.push(`สมาชิก: ${me.firstName} ${me.lastName} · บ้านเลขที่ ${me.houseNumber ?? "-"} (สิทธิ์: ${me.role})`);

  if (Array.isArray(upcoming) && upcoming.length) {
    lines.push("การจองที่จะถึงของฉัน:");
    for (const r of upcoming)
      lines.push(`  - ${r.date} ${r.startTime}-${r.endTime} · ${r.numberOfPeople} คน · สถานะ ${r.status}` + (r.notes ? ` (${r.notes})` : ""));
  } else lines.push("การจองที่จะถึงของฉัน: ไม่มี");

  if (wallet) lines.push(`กระเป๋าเงิน: คงเหลือ ${thb(wallet.balance)} บาท`);

  if (Array.isArray(packages) && packages.length) {
    lines.push("แพ็กเกจของฉัน:");
    for (const p of packages)
      lines.push(`  - ${p.package?.name ?? "-"} · สถานะ ${p.isExpired ? "หมดอายุ" : p.status}` + (p.endDate ? ` · ถึง ${String(p.endDate).slice(0, 10)}` : ""));
  } else lines.push("แพ็กเกจของฉัน: ไม่มี (ต้องมีแพ็กเกจ/สิทธิ์คงเหลือจึงจะจองได้)");

  // Instructors teaching today
  if (today2 && Array.isArray(today2.instructors) && today2.instructors.length) {
    lines.push(`ครูฝึกที่มีคิวสอนวันนี้ (${today2.date}):`);
    for (const t of today2.instructors)
      lines.push(`  - ${t.firstName} ${t.lastName}${t.specialty ? ` (${t.specialty})` : ""} · ${t.sessionCount} คิว` +
        (t.sessions?.length ? " · " + t.sessions.map((s) => `${s.startTime}-${s.endTime}`).join(", ") : ""));
  } else lines.push("ครูฝึกที่มีคิวสอนวันนี้: ไม่มี");

  // All instructors + their weekly/specific availability
  if (instrList.length) {
    lines.push("ครูฝึกทั้งหมดและวันที่ลงตารางสอน:");
    instrList.forEach((i, idx) => {
      const av = Array.isArray(avails[idx]) ? avails[idx] : [];
      const weekly = av.filter((a) => a.kind === "weekly").map((a) => `${DOW[a.dayOfWeek]} ${a.startTime}-${a.endTime}`);
      const dates = av.filter((a) => a.kind === "date").map((a) => `${a.date} ${a.startTime}-${a.endTime}`);
      const sched = [...weekly, ...dates].join(", ") || "ยังไม่ลงตาราง";
      lines.push(`  - ${i.firstName} ${i.lastName}${i.specialty ? ` (${i.specialty})` : ""} · สถานะ ${i.status} · ${sched}`);
    });
  }

  if (Array.isArray(facilities) && facilities.length) {
    lines.push("สระ/สิ่งอำนวยความสะดวก:");
    for (const f of facilities)
      lines.push(`  - ${f.name} · เปิด ${f.openTime}-${f.closeTime} · ความจุ ${f.capacity} คน` +
        (f.description ? ` · ${String(f.description).slice(0, 120)}` : "") + (f.location ? ` · ${f.location}` : ""));
  }

  if (Array.isArray(products) && products.length) {
    lines.push("สินค้า/ร้านค้าสโมสร:");
    for (const p of products.slice(0, 20))
      lines.push(`  - ${p.name}${p.category ? ` [${p.category}]` : ""} · ${thb(p.price)} บาท` +
        (p.stock != null ? ` · เหลือ ${p.stock}` : "") + (p.description ? ` · ${String(p.description).slice(0, 100)}` : ""));
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
  return { text: "ข้อมูลระบบจริง (ถือเป็นความจริง ห้ามแต่งเพิ่ม):\n" + lines.join("\n"), me, instructors: instrList };
}

// ---- agent actions ----
const PAGE_ROUTE = {
  topup: "/topup", packages: "/packages", products: "/products", services: "/services",
  book: "/book", reservations: "/reservations", wallet: "/wallet", membership: "/membership-card", profile: "/profile",
};

const addHour = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  const d = new Date(0); d.setHours((h || 0) + 1, m || 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Phase 1: decide if the user wants an ACTION (book / navigate) vs just a question.
// Uses Ollama JSON mode for a reliable, parseable decision from the small local model.
async function decideAction(userMsg, history, instructors) {
  const today = dayFmt.format(new Date());
  const names = (instructors || []).map((i) => `${i.firstName} ${i.lastName}`).join(", ") || "-";
  const sys =
    'คุณเป็นตัวแยกเจตนา (intent) ของผู้ใช้แอปจองสระว่ายน้ำ Aquarich ตอบเป็น JSON เท่านั้น\n' +
    `วันนี้คือ ${today} (Asia/Bangkok) แปลงวันสัมพัทธ์ (วันนี้/พรุ่งนี้/มะรืน/สุดสัปดาห์) เป็น YYYY-MM-DD\n` +
    `รายชื่อครูฝึก: ${names}\n` +
    'เลือก action เดียว:\n' +
    '- "book": ผู้ใช้ต้องการ "จอง" และระบุวันชัดเจน → ใส่ date(YYYY-MM-DD), startTime(HH:MM 24ชม.), endTime(ไม่ระบุให้เว้นว่าง), people(ไม่ระบุ=1), instructor(เฉพาะถ้าเอ่ยชื่อครู)\n' +
    '- "navigate": ผู้ใช้ขอ "พาไป"/เปิดหน้า/อยากเติมเงิน → page ∈ topup,packages,products,services,book,reservations,wallet,membership,profile\n' +
    '- "none": เป็นคำถาม ขอข้อมูล หรือคุยเล่น (รวมถึงถามว่าครูใครลงวันไหน/วันนี้มีครูไหม ราคาสินค้า ฯลฯ)\n' +
    'ถ้าอยากจองแต่ยังไม่บอกวัน → ใช้ navigate page=book\n' +
    'schema: {"action":"none|book|navigate","page":"","date":"","startTime":"","endTime":"","people":1,"instructor":"","say":"ข้อความไทยสั้นๆยืนยัน"}';
  const msgs = [{ role: "system", content: sys }, ...history.slice(-6), { role: "user", content: userMsg }];
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: msgs, stream: false, format: "json", options: { temperature: 0, num_ctx: 4096 } }),
    });
    if (!r.ok) return { action: "none" };
    const d = await r.json();
    const obj = JSON.parse(d.message?.content || "{}");
    return obj && typeof obj.action === "string" ? obj : { action: "none" };
  } catch { return { action: "none" }; }
}

// Create a reservation on the member's behalf (booking is allowed; topping up is NOT).
async function executeBook(token, a, instructors) {
  if (!token) return { text: "กรุณาเข้าสู่ระบบก่อนจองนะคะ", nav: null };
  if (!a.date || !a.startTime) return { text: "พาไปหน้าจองนะคะ — ระบุวันและเวลาที่ต้องการได้เลยค่ะ", nav: "/book" };
  const startTime = a.startTime;
  const endTime = a.endTime || addHour(startTime);
  let instructorId = null, instName = "";
  if (a.instructor) {
    const f = (instructors || []).find((i) => `${i.firstName} ${i.lastName}`.includes(a.instructor) || (i.firstName || "").includes(a.instructor));
    if (f) { instructorId = f.id; instName = `${f.firstName} ${f.lastName}`; }
  }
  try {
    const r = await fetch(`${API}/reservations`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: a.date, startTime, endTime, numberOfPeople: a.people || 1, instructorId, notes: "จองผ่านน้องอควา" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { text: `ขออภัยค่ะ จองไม่สำเร็จ: ${d.error || "เกิดข้อผิดพลาด"} 🙏 ลองเปลี่ยนเวลา หรือไปที่หน้าจองได้ค่ะ`, nav: null };
    const status = d.status === "confirmed" ? "ยืนยันแล้ว ✅" : "รอแอดมิน/ครูยืนยัน ⏳";
    return { text: `จองให้เรียบร้อยแล้วค่ะ 🎉\nวันที่ ${a.date} เวลา ${startTime}-${endTime} · ${a.people || 1} คน${instName ? ` · ครู ${instName}` : ""}\nสถานะ: ${status}\nดูได้ที่หน้า "การจองของฉัน" ค่ะ`, nav: "/reservations" };
  } catch {
    return { text: "เชื่อมต่อระบบจองไม่ได้ค่ะ ลองใหม่อีกครั้งนะคะ", nav: null };
  }
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

      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", ...CORS });
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);

      // ── Phase 1: agentic action (book / navigate) ─────────────────────────
      const decision = token ? await decideAction(userMsg, history, ctx.instructors) : { action: "none" };
      if (decision.action === "navigate" && PAGE_ROUTE[decision.page]) {
        const say = (decision.say && String(decision.say)) || "พาไปให้แล้วค่ะ";
        send({ t: say }); send({ nav: PAGE_ROUTE[decision.page] }); send({ done: true });
        await logChat({ userId: me?.id ?? null, memberCode: me?.memberCode ?? null, name: me ? `${me.firstName} ${me.lastName}` : null, role: me?.role ?? "guest", intent, action: `navigate:${decision.page}`, escalated: false, message: userMsg.slice(0, 2000), reply: say });
        return res.end();
      }
      if (decision.action === "book") {
        const r = await executeBook(token, decision, ctx.instructors);
        send({ t: r.text });
        if (r.nav) send({ nav: r.nav });
        send({ done: true });
        await logChat({ userId: me?.id ?? null, memberCode: me?.memberCode ?? null, name: me ? `${me.firstName} ${me.lastName}` : null, role: me?.role ?? "guest", intent: "booking", action: r.nav === "/reservations" ? "book:ok" : "book:fail", escalated: false, message: userMsg.slice(0, 2000), reply: r.text });
        return res.end();
      }

      // ── Phase 2: normal grounded Q&A (streamed) ───────────────────────────
      const messages = [
        { role: "system", content: state.system + "\n\n" + userBlock },
        ...history,
        { role: "user", content: userMsg },
      ];

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
