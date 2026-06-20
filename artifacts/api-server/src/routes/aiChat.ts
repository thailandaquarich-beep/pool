import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { db, aiChatMessagesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { dataDirs } from "../lib/dataPaths.js";

const router = Router();
router.use(authenticate); // every route needs a signed-in user; admin routes add requireAdmin

const HISTORY_MAX = 50;

// GET /ai-chat/history — the signed-in member's saved AI conversation (oldest first)
router.get("/history", async (req, res) => {
  try {
    const rows = await db
      .select({ role: aiChatMessagesTable.role, content: aiChatMessagesTable.content })
      .from(aiChatMessagesTable)
      .where(eq(aiChatMessagesTable.userId, req.user!.userId))
      .orderBy(asc(aiChatMessagesTable.id))
      .limit(HISTORY_MAX);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to load chat history" });
  }
});

// POST /ai-chat/turn — append one completed turn (user message + assistant reply)
router.post("/turn", async (req, res) => {
  try {
    const message = String(req.body?.message ?? "").slice(0, 4000);
    const reply = String(req.body?.reply ?? "").slice(0, 8000);
    if (!message || !reply) return res.status(400).json({ error: "message and reply are required" });
    await db.insert(aiChatMessagesTable).values([
      { userId: req.user!.userId, role: "user", content: message },
      { userId: req.user!.userId, role: "assistant", content: reply },
    ]);
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to save chat turn" });
  }
});

// DELETE /ai-chat/history — clear the signed-in member's conversation
router.delete("/history", async (req, res) => {
  try {
    await db.delete(aiChatMessagesTable).where(eq(aiChatMessagesTable.userId, req.user!.userId));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to clear chat history" });
  }
});

type Entry = {
  at: string; atLocal?: string;
  userId: number | null; memberCode: string | null; name: string | null; role?: string;
  intent: string; escalated: boolean; message: string; reply: string;
};

async function readAllEntries(): Promise<Entry[]> {
  try {
    await fs.mkdir(dataDirs.chatLogs, { recursive: true });
    const files = (await fs.readdir(dataDirs.chatLogs)).filter((f) => f.startsWith("chat-") && f.endsWith(".jsonl"));
    const out: Entry[] = [];
    for (const f of files) {
      const text = await fs.readFile(path.join(dataDirs.chatLogs, f), "utf-8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try { out.push(JSON.parse(line)); } catch { /* skip bad line */ }
      }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    return [];
  }
}

// GET /ai-chat/analytics — aggregated view of what customers want + escalations
router.get("/analytics", requireAdmin, async (_req, res) => {
  try {
    const entries = await readAllEntries();
    const byIntent: Record<string, number> = {};
    const customers = new Map<string, any>();
    let escalations = 0;

    for (const e of entries) {
      byIntent[e.intent] = (byIntent[e.intent] || 0) + 1;
      if (e.escalated) escalations++;
      const key = e.userId != null ? String(e.userId) : "anonymous";
      const c = customers.get(key) || {
        userId: e.userId, name: e.name, memberCode: e.memberCode,
        messageCount: 0, escalated: false, intents: {} as Record<string, number>,
        lastMessage: "", lastAt: "",
      };
      c.messageCount++;
      c.escalated = c.escalated || e.escalated;
      c.intents[e.intent] = (c.intents[e.intent] || 0) + 1;
      if (!c.lastAt || e.at > c.lastAt) { c.lastAt = e.at; c.lastMessage = e.message; }
      if (e.name && !c.name) c.name = e.name;
      if (e.memberCode && !c.memberCode) c.memberCode = e.memberCode;
      customers.set(key, c);
    }

    const customerList = [...customers.values()].map((c) => ({
      ...c,
      topIntent: Object.entries(c.intents).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? "general",
    })).sort((a, b) => (Number(b.escalated) - Number(a.escalated)) || b.lastAt.localeCompare(a.lastAt));

    return res.json({
      totalMessages: entries.length,
      totalCustomers: customers.size,
      escalations,
      byIntent,
      customers: customerList,
    });
  } catch {
    return res.status(500).json({ error: "Failed to build analytics" });
  }
});

// GET /ai-chat/conversation/:userId — full conversation of one customer
router.get("/conversation/:userId", requireAdmin, async (req, res) => {
  try {
    const file = path.join(dataDirs.chatLogs, "users", `${path.basename(req.params.userId)}.jsonl`);
    let text = "";
    try { text = await fs.readFile(file, "utf-8"); } catch { return res.json([]); }
    const rows = text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to read conversation" });
  }
});

export default router;
