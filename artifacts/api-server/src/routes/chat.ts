import { Router } from "express";
import { db, chatTicketsTable, chatMessagesTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { maybeAiReply } from "../lib/ai-assistant.js";

const router = Router();

// POST /chat/tickets — member: create ticket
router.post("/tickets", authenticate, async (req, res) => {
  try {
    const { subject, type, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: "subject and message required" });

    const [ticket] = await db.insert(chatTicketsTable).values({
      userId: req.user!.userId,
      subject,
      type: type || "question",
    }).returning();

    const [msg] = await db.insert(chatMessagesTable).values({
      ticketId: ticket.id,
      senderId: req.user!.userId,
      message,
      isAdminMessage: false,
    }).returning();

    void maybeAiReply(ticket.id); // AI first-responder (fire-and-forget; no-op unless AI_CHAT_ENABLED)
    return res.status(201).json({ ticket: { ...ticket, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), closedAt: null }, firstMessage: { ...msg, createdAt: msg.createdAt.toISOString() } });
  } catch {
    return res.status(500).json({ error: "Failed to create ticket" });
  }
});

// GET /chat/tickets — member: my tickets / admin: all tickets
router.get("/tickets", authenticate, async (req, res) => {
  try {
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    const status = req.query.status as string | undefined;

    let query = db
      .select({
        ticket: chatTicketsTable,
        user: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName },
        messageCount: sql<number>`count(${chatMessagesTable.id})::int`,
        lastMessage: sql<string>`max(${chatMessagesTable.createdAt}::text)`,
      })
      .from(chatTicketsTable)
      .leftJoin(chatMessagesTable, eq(chatMessagesTable.ticketId, chatTicketsTable.id))
      .innerJoin(usersTable, eq(chatTicketsTable.userId, usersTable.id))
      .$dynamic();

    if (!isAdmin) query = query.where(eq(chatTicketsTable.userId, req.user!.userId)) as any;
    if (status) query = query.where(eq(chatTicketsTable.status, status as any)) as any;

    const rows = await (query as any)
      .groupBy(chatTicketsTable.id, usersTable.id, usersTable.firstName, usersTable.lastName)
      .orderBy(desc(chatTicketsTable.updatedAt))
      .limit(100);

    return res.json(rows.map((r: any) => ({
      ...r.ticket,
      createdAt: r.ticket.createdAt.toISOString(),
      updatedAt: r.ticket.updatedAt.toISOString(),
      closedAt: r.ticket.closedAt?.toISOString() || null,
      user: r.user,
      messageCount: r.messageCount,
    })));
  } catch {
    return res.status(500).json({ error: "Failed to list tickets" });
  }
});

// GET /chat/tickets/:id/messages — get messages for ticket
router.get("/tickets/:id/messages", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    const [ticket] = await db.select().from(chatTicketsTable).where(eq(chatTicketsTable.id, ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (!isAdmin && ticket.userId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

    const messages = await db
      .select({ msg: chatMessagesTable, sender: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role } })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.ticketId, ticketId))
      .orderBy(chatMessagesTable.createdAt);

    // Mark as read
    if (isAdmin) {
      await db.update(chatMessagesTable).set({ isRead: true }).where(and(eq(chatMessagesTable.ticketId, ticketId), eq(chatMessagesTable.isAdminMessage, false)));
    }

    return res.json({ ticket: { ...ticket, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), closedAt: ticket.closedAt?.toISOString() || null }, messages: messages.map(m => ({ ...m.msg, createdAt: m.msg.createdAt.toISOString(), sender: m.sender })) });
  } catch {
    return res.status(500).json({ error: "Failed to get messages" });
  }
});

// POST /chat/tickets/:id/messages — send a message
router.post("/tickets/:id/messages", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { message, imageUrl } = req.body;
    if (!message && !imageUrl) return res.status(400).json({ error: "message required" });

    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    const [ticket] = await db.select().from(chatTicketsTable).where(eq(chatTicketsTable.id, ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (!isAdmin && ticket.userId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });
    if (ticket.status === "closed") return res.status(400).json({ error: "Ticket is closed" });

    const [msg] = await db.insert(chatMessagesTable).values({
      ticketId,
      senderId: req.user!.userId,
      message: message || "",
      imageUrl,
      isAdminMessage: isAdmin,
    }).returning();

    await db.update(chatTicketsTable).set({ updatedAt: new Date(), status: isAdmin ? "in_progress" : "open" }).where(eq(chatTicketsTable.id, ticketId));

    if (!isAdmin) void maybeAiReply(ticketId); // member replied -> AI may answer (no-op unless enabled)
    return res.status(201).json({ ...msg, createdAt: msg.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: "Failed to send message" });
  }
});

// PATCH /chat/tickets/:id — admin: update ticket status
router.patch("/tickets/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, assignedTo } = req.body;
    const updates: any = {};
    if (status) { updates.status = status; if (status === "closed" || status === "resolved") updates.closedAt = new Date(); }
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    updates.updatedAt = new Date();
    const [ticket] = await db.update(chatTicketsTable).set(updates).where(eq(chatTicketsTable.id, id)).returning();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    return res.json({ ...ticket, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), closedAt: ticket.closedAt?.toISOString() || null });
  } catch {
    return res.status(500).json({ error: "Failed to update ticket" });
  }
});

// GET /chat/unread — admin: unread count
router.get("/unread", authenticate, requireAdmin, async (req, res) => {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.isAdminMessage, false), eq(chatMessagesTable.isRead, false)));
    return res.json({ unreadCount: count });
  } catch {
    return res.status(500).json({ error: "Failed to get unread count" });
  }
});

export default router;
