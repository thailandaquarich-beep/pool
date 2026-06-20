// Unified notification feed — read-only aggregate over existing tables (no new table / migration).
// Member: announcements + own reservation status + topup approvals + staff/AI chat replies.
// Admin: announcements + pending topups + tickets with unread member messages.
// Provides GET /notifications (poll) and GET /notifications/stream (SSE push).
import { Router } from "express";
import {
  db, announcementsTable, reservationsTable, topupRequestsTable,
  chatTicketsTable, chatMessagesTable, instructorsTable, usersTable, ordersTable,
} from "@workspace/db";
import { eq, and, desc, gte, ne } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

type Notif = {
  id: string; kind: "announcement" | "reservation" | "topup" | "chat" | "order";
  level: "info" | "success" | "warning" | "maintenance"; title: string; body: string;
  at: string; href: string | null; pinned?: boolean;
};

const baht = (n: unknown) => Number(n).toLocaleString("th-TH");

async function buildNotifications(user: { userId: number; role: string }): Promise<Notif[]> {
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const now = new Date();
  const items: Notif[] = [];

  // Announcements (everyone)
  const anns = await db.select().from(announcementsTable)
    .where(eq(announcementsTable.isPublished, true))
    .orderBy(desc(announcementsTable.createdAt)).limit(20);
  for (const a of anns) {
    if (a.expiresAt && a.expiresAt < now) continue;
    items.push({ id: `ann-${a.id}`, kind: "announcement", level: a.type, title: a.title,
      body: a.content, at: a.createdAt.toISOString(), pinned: a.isPinned, href: null });
  }

  if (isAdmin) {
    // pending topups
    const pend = await db.select().from(topupRequestsTable)
      .where(eq(topupRequestsTable.status, "pending"))
      .orderBy(desc(topupRequestsTable.createdAt)).limit(15);
    for (const p of pend)
      items.push({ id: `atopup-${p.id}`, kind: "topup", level: "warning", title: "คำขอเติมเงินรออนุมัติ",
        body: `${baht(p.amount)} บาท`, at: p.createdAt.toISOString(), href: "/admin/wallet" });

    // tickets with unread member messages
    const unread = await db.select().from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.isAdminMessage, false), eq(chatMessagesTable.isRead, false)))
      .orderBy(desc(chatMessagesTable.createdAt)).limit(30);
    const seenTickets = new Set<number>();
    for (const m of unread) {
      if (seenTickets.has(m.ticketId)) continue;
      seenTickets.add(m.ticketId);
      items.push({ id: `achat-${m.ticketId}-${m.id}`, kind: "chat", level: "info", title: "ข้อความใหม่จากสมาชิก",
        body: (m.message || "").slice(0, 80), at: m.createdAt.toISOString(), href: "/admin/chat" });
    }

    // new shop orders awaiting review (slip check / shipping)
    const pendOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.status, "pending")).orderBy(desc(ordersTable.createdAt)).limit(15);
    for (const o of pendOrders)
      items.push({ id: `aorder-${o.id}`, kind: "order", level: "warning", title: "คำสั่งซื้อใหม่ รอตรวจสอบ",
        body: `#${o.id} · ${o.recipientName} · ${baht(o.subtotal)} บาท`, at: o.createdAt.toISOString(), href: "/admin/orders" });
  } else {
    const uid = user.userId;
    // reservation status changes (recent)
    const rs = await db.select().from(reservationsTable)
      .where(eq(reservationsTable.userId, uid)).orderBy(desc(reservationsTable.createdAt)).limit(10);
    for (const r of rs) {
      if (r.status !== "confirmed" && r.status !== "cancelled") continue;
      items.push({ id: `res-${r.id}`, kind: "reservation",
        level: r.status === "cancelled" ? "warning" : "success",
        title: r.status === "confirmed" ? "การจองได้รับการยืนยัน" : "การจองถูกยกเลิก",
        body: `${r.date} ${r.startTime}-${r.endTime} · ${r.numberOfPeople} คน`,
        at: r.createdAt.toISOString(), href: "/reservations" });
    }
    // topup results
    const tps = await db.select().from(topupRequestsTable)
      .where(eq(topupRequestsTable.userId, uid)).orderBy(desc(topupRequestsTable.createdAt)).limit(10);
    for (const t of tps) {
      if ((t.status !== "approved" && t.status !== "rejected") || !t.reviewedAt) continue;
      items.push({ id: `topup-${t.id}`, kind: "topup",
        level: t.status === "approved" ? "success" : "warning",
        title: t.status === "approved" ? "เติมเงินสำเร็จ" : "คำขอเติมเงินถูกปฏิเสธ",
        body: `${baht(t.amount)} บาท${t.reviewNote ? ` · ${t.reviewNote}` : ""}`,
        at: t.reviewedAt.toISOString(), href: "/wallet" });
    }
    // shop order status updates (paid / shipped / cancelled)
    const myOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.userId, uid)).orderBy(desc(ordersTable.createdAt)).limit(10);
    for (const o of myOrders) {
      if (o.status === "paid")
        items.push({ id: `order-${o.id}-paid`, kind: "order", level: "success", title: "ยืนยันการชำระเงินแล้ว",
          body: `คำสั่งซื้อ #${o.id} · ${baht(o.subtotal)} บาท`, at: (o.paidAt ?? o.createdAt).toISOString(), href: "/my-orders" });
      else if (o.status === "shipped")
        items.push({ id: `order-${o.id}-shipped`, kind: "order", level: "info", title: "คำสั่งซื้อจัดส่งแล้ว",
          body: `#${o.id}${o.trackingNo ? ` · พัสดุ ${o.trackingNo}` : ""}`, at: (o.shippedAt ?? o.createdAt).toISOString(), href: "/my-orders" });
      else if (o.status === "cancelled")
        items.push({ id: `order-${o.id}-cancelled`, kind: "order", level: "warning", title: "คำสั่งซื้อถูกยกเลิก",
          body: `#${o.id} · ${baht(o.subtotal)} บาท`, at: o.createdAt.toISOString(), href: "/my-orders" });
    }
    // latest staff/AI reply per ticket
    const myTickets = await db.select().from(chatTicketsTable)
      .where(eq(chatTicketsTable.userId, uid)).orderBy(desc(chatTicketsTable.updatedAt)).limit(15);
    for (const tk of myTickets) {
      const [m] = await db.select().from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.ticketId, tk.id), eq(chatMessagesTable.isAdminMessage, true)))
        .orderBy(desc(chatMessagesTable.createdAt)).limit(1);
      if (m) items.push({ id: `chat-${tk.id}-${m.id}`, kind: "chat", level: "info",
        title: `ตอบกลับ: ${tk.subject}`, body: (m.message || "").slice(0, 80),
        at: m.createdAt.toISOString(), href: "/chat" });
    }

    // If this user is also linked as an instructor, surface incoming teaching
    // bookings ("someone booked your queue") — regardless of their account role,
    // so instructors get BOTH member notifications and their teaching queue.
    const [inst] = await db.select({ id: instructorsTable.id })
      .from(instructorsTable).where(eq(instructorsTable.userId, uid)).limit(1);
    if (inst) {
      const today = now.toISOString().slice(0, 10);
      const bk = await db
        .select({
          id: reservationsTable.id, date: reservationsTable.date, startTime: reservationsTable.startTime,
          endTime: reservationsTable.endTime, numberOfPeople: reservationsTable.numberOfPeople,
          status: reservationsTable.status,
          createdAt: reservationsTable.createdAt, fn: usersTable.firstName, ln: usersTable.lastName,
        })
        .from(reservationsTable)
        .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
        .where(and(
          eq(reservationsTable.instructorId, inst.id),
          gte(reservationsTable.date, today),
          ne(reservationsTable.status, "cancelled"),
        ))
        .orderBy(desc(reservationsTable.createdAt)).limit(20);
      for (const b of bk)
        items.push({ id: `booking-${b.id}`, kind: "reservation",
          level: b.status === "pending" ? "warning" : "info",
          title: b.status === "pending" ? "มีผู้จองคิวฝึก รอยืนยัน" : "มีผู้จองคิวฝึกกับคุณ",
          body: `${b.fn} ${b.ln} · ${b.date} ${b.startTime}-${b.endTime} · ${b.numberOfPeople} คน`,
          at: b.createdAt.toISOString(), href: "/instructor/schedule" });
    }
  }

  // newest first; pinned announcements floated to top
  items.sort((a, b) => (Number(b.pinned || false) - Number(a.pinned || false)) || (a.at < b.at ? 1 : -1));
  return items.slice(0, 40);
}

// GET /notifications — poll
router.get("/", authenticate, async (req, res) => {
  try {
    const items = await buildNotifications(req.user!);
    return res.json({ items, serverTime: new Date().toISOString() });
  } catch {
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

// GET /notifications/stream — SSE push (consume via fetch+reader so the Bearer header works)
router.get("/stream", authenticate, async (req, res) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  const send = async () => {
    try {
      const items = await buildNotifications(req.user!);
      res.write(`data: ${JSON.stringify({ items, serverTime: new Date().toISOString() })}\n\n`);
    } catch { /* ignore one tick */ }
  };
  await send();
  const iv = setInterval(send, 15000);
  req.on("close", () => clearInterval(iv));
});

export default router;
