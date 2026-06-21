import { Router } from "express";
import { db, devTicketsTable, devTicketMessagesTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";

// ศูนย์ช่วยเหลือ (Help Center): admins open tickets to reach the DEV team.
// super_admin IS the DEV — they see every ticket and reply in-app; a regular
// admin only sees the tickets they opened.
const router = Router();

const isDev = (role?: string) => role === "super_admin";

function ticketJson(t: typeof devTicketsTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() || null,
  };
}

// POST /dev-support/tickets — any admin opens a ticket
router.post("/tickets", authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, type, priority, message, imageUrl } = req.body;
    if (!subject || !message) return res.status(400).json({ error: "subject and message required" });

    const [ticket] = await db.insert(devTicketsTable).values({
      openedBy: req.user!.userId,
      subject,
      type: type || "question",
      priority: priority || "normal",
    }).returning();

    const [msg] = await db.insert(devTicketMessagesTable).values({
      ticketId: ticket.id,
      senderId: req.user!.userId,
      message,
      imageUrl: imageUrl || null,
      fromDev: false,
    }).returning();

    return res.status(201).json({
      ticket: ticketJson(ticket),
      firstMessage: { ...msg, createdAt: msg.createdAt.toISOString() },
    });
  } catch {
    return res.status(500).json({ error: "Failed to create ticket" });
  }
});

// GET /dev-support/tickets — super_admin: all; admin: own. Includes opener + unread count.
router.get("/tickets", authenticate, requireAdmin, async (req, res) => {
  try {
    const dev = isDev(req.user!.role);
    const status = req.query.status as string | undefined;

    let query = db
      .select({
        ticket: devTicketsTable,
        opener: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, profileImageUrl: usersTable.profileImageUrl },
        messageCount: sql<number>`count(${devTicketMessagesTable.id})::int`,
        // Unread = messages whose recipient is the *viewer* and not yet read.
        unread: dev
          ? sql<number>`count(*) filter (where ${devTicketMessagesTable.fromDev} = false and ${devTicketMessagesTable.isRead} = false)::int`
          : sql<number>`count(*) filter (where ${devTicketMessagesTable.fromDev} = true and ${devTicketMessagesTable.isRead} = false)::int`,
      })
      .from(devTicketsTable)
      .leftJoin(devTicketMessagesTable, eq(devTicketMessagesTable.ticketId, devTicketsTable.id))
      .innerJoin(usersTable, eq(devTicketsTable.openedBy, usersTable.id))
      .$dynamic();

    if (!dev) query = query.where(eq(devTicketsTable.openedBy, req.user!.userId)) as any;
    if (status) query = query.where(eq(devTicketsTable.status, status)) as any;

    const rows = await (query as any)
      .groupBy(devTicketsTable.id, usersTable.id, usersTable.firstName, usersTable.lastName, usersTable.role, usersTable.profileImageUrl)
      .orderBy(desc(devTicketsTable.updatedAt))
      .limit(200);

    return res.json(rows.map((r: any) => ({
      ...ticketJson(r.ticket),
      opener: r.opener,
      messageCount: r.messageCount,
      unread: r.unread,
    })));
  } catch {
    return res.status(500).json({ error: "Failed to list tickets" });
  }
});

// GET /dev-support/tickets/:id/messages
router.get("/tickets/:id/messages", authenticate, requireAdmin, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const dev = isDev(req.user!.role);

    const [ticket] = await db.select().from(devTicketsTable).where(eq(devTicketsTable.id, ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (!dev && ticket.openedBy !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

    const messages = await db
      .select({ msg: devTicketMessagesTable, sender: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, profileImageUrl: usersTable.profileImageUrl } })
      .from(devTicketMessagesTable)
      .innerJoin(usersTable, eq(devTicketMessagesTable.senderId, usersTable.id))
      .where(eq(devTicketMessagesTable.ticketId, ticketId))
      .orderBy(devTicketMessagesTable.createdAt);

    // Mark the messages addressed to *this* viewer as read.
    await db.update(devTicketMessagesTable)
      .set({ isRead: true })
      .where(and(
        eq(devTicketMessagesTable.ticketId, ticketId),
        eq(devTicketMessagesTable.fromDev, !dev), // dev reads admin msgs (fromDev=false); admin reads dev msgs (fromDev=true)
        eq(devTicketMessagesTable.isRead, false),
      ));

    return res.json({
      ticket: ticketJson(ticket),
      messages: messages.map(m => ({ ...m.msg, createdAt: m.msg.createdAt.toISOString(), sender: m.sender })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to get messages" });
  }
});

// POST /dev-support/tickets/:id/messages — reply (opener admin or DEV)
router.post("/tickets/:id/messages", authenticate, requireAdmin, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { message, imageUrl } = req.body;
    if (!message && !imageUrl) return res.status(400).json({ error: "message required" });

    const dev = isDev(req.user!.role);
    const [ticket] = await db.select().from(devTicketsTable).where(eq(devTicketsTable.id, ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (!dev && ticket.openedBy !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });
    if (ticket.status === "closed") return res.status(400).json({ error: "Ticket is closed" });

    const [msg] = await db.insert(devTicketMessagesTable).values({
      ticketId,
      senderId: req.user!.userId,
      message: message || "",
      imageUrl: imageUrl || null,
      fromDev: dev,
    }).returning();

    // DEV reply -> in_progress; admin reply -> reopen to open. Never auto-touch a closed ticket (blocked above).
    await db.update(devTicketsTable)
      .set({ updatedAt: new Date(), status: dev ? "in_progress" : "open" })
      .where(eq(devTicketsTable.id, ticketId));

    return res.status(201).json({ ...msg, createdAt: msg.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: "Failed to send message" });
  }
});

// PATCH /dev-support/tickets/:id — update status / priority (opener or DEV)
router.patch("/tickets/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dev = isDev(req.user!.role);
    const [existing] = await db.select().from(devTicketsTable).where(eq(devTicketsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Ticket not found" });
    if (!dev && existing.openedBy !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

    const { status, priority } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) {
      updates.status = status;
      updates.closedAt = (status === "closed" || status === "resolved") ? new Date() : null;
    }
    if (priority && dev) updates.priority = priority; // only DEV re-prioritises

    const [ticket] = await db.update(devTicketsTable).set(updates).where(eq(devTicketsTable.id, id)).returning();
    return res.json(ticketJson(ticket));
  } catch {
    return res.status(500).json({ error: "Failed to update ticket" });
  }
});

// GET /dev-support/unread — badge count for the viewer's role
router.get("/unread", authenticate, requireAdmin, async (req, res) => {
  try {
    const dev = isDev(req.user!.role);
    let whereClause;
    if (dev) {
      whereClause = and(eq(devTicketMessagesTable.fromDev, false), eq(devTicketMessagesTable.isRead, false));
    } else {
      // admin: unread DEV replies on tickets they opened
      whereClause = and(
        eq(devTicketMessagesTable.fromDev, true),
        eq(devTicketMessagesTable.isRead, false),
        sql`${devTicketMessagesTable.ticketId} in (select id from ${devTicketsTable} where ${devTicketsTable.openedBy} = ${req.user!.userId})`,
      );
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(devTicketMessagesTable)
      .where(whereClause);
    return res.json({ unreadCount: count });
  } catch {
    return res.status(500).json({ error: "Failed to get unread count" });
  }
});

export default router;
