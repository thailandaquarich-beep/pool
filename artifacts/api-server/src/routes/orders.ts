import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { db, ordersTable, productsTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { authenticate, requireAdmin, isAdminRole } from "../middlewares/auth.js";
import { dataDirs } from "../lib/dataPaths.js";

const router = Router();

type OrderRow = typeof ordersTable.$inferSelect;

function fmt(o: OrderRow, user?: typeof usersTable.$inferSelect) {
  return {
    ...o,
    subtotal: Number(o.subtotal),
    items: (() => { try { return JSON.parse(o.items || "[]"); } catch { return []; } })(),
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    shippedAt: o.shippedAt ? o.shippedAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
    user: user ? { id: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username } : undefined,
  };
}

const bkkDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });

// Append a completed sale to data/sales/sales-YYYY-MM.jsonl (revenue backup, best-effort)
async function logSale(o: OrderRow) {
  try {
    const today = bkkDay.format(new Date()); // YYYY-MM-DD
    await fs.mkdir(dataDirs.sales, { recursive: true });
    const entry = {
      orderId: o.id, at: new Date().toISOString(), day: today, userId: o.userId,
      customer: o.recipientName, phone: o.phone,
      items: (() => { try { return JSON.parse(o.items || "[]"); } catch { return []; } })(),
      subtotal: Number(o.subtotal),
      province: o.province ?? null,
      paidAt: o.paidAt ? o.paidAt.toISOString() : new Date().toISOString(),
    };
    await fs.appendFile(path.join(dataDirs.sales, `sales-${today.slice(0, 7)}.jsonl`), JSON.stringify(entry) + "\n", "utf8");
  } catch { /* ignore */ }
}

async function saveSlip(dataUrl: unknown, orderId: number, userId: number): Promise<string | null> {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    const buf = Buffer.from(m[2], "base64");
    await fs.mkdir(dataDirs.slips, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `order-${orderId}-user-${userId}-${stamp}.${ext}`;
    await fs.writeFile(path.join(dataDirs.slips, filename), buf);
    return filename;
  } catch { return null; }
}

// POST /orders — member places an order (cart checkout)
router.post("/", authenticate, async (req, res) => {
  try {
    const { items, recipientName, phone, address, subdistrict, district, province, zipcode, slipImageUrl, note } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "ตะกร้าว่าง" });
    if (!recipientName || !phone || !address) return res.status(400).json({ error: "กรุณากรอกชื่อผู้รับ เบอร์โทร และที่อยู่ให้ครบ" });

    const ids = [...new Set(items.map((i: any) => Number(i.productId)).filter(Boolean))];
    const prods = ids.length ? await db.select().from(productsTable).where(inArray(productsTable.id, ids)) : [];
    const byId = Object.fromEntries(prods.map((p) => [p.id, p]));

    const lineItems: { productId: number; name: string; price: number; qty: number }[] = [];
    let subtotal = 0;
    for (const i of items as any[]) {
      const p = byId[Number(i.productId)];
      if (!p || !p.isActive) continue;
      const qty = Math.max(1, Number(i.qty) || 1);
      const price = Number(p.price);
      lineItems.push({ productId: p.id, name: p.name, price, qty });
      subtotal += price * qty;
    }
    if (lineItems.length === 0) return res.status(400).json({ error: "ไม่พบสินค้าที่สั่งซื้อ" });

    const paid = typeof slipImageUrl === "string" && slipImageUrl.startsWith("data:");
    const [order] = await db
      .insert(ordersTable)
      .values({
        userId: req.user!.userId,
        items: JSON.stringify(lineItems),
        subtotal: String(subtotal),
        status: paid ? "paid" : "pending",
        recipientName, phone, address,
        subdistrict: subdistrict || null, district: district || null, province: province || null, zipcode: zipcode || null,
        slipImageUrl: typeof slipImageUrl === "string" ? slipImageUrl : null,
        note: note || null,
        paidAt: paid ? new Date() : null,
      })
      .returning();

    if (paid) {
      await logSale(order);
      const fn = await saveSlip(slipImageUrl, order.id, req.user!.userId);
      if (fn) {
        const [u] = await db.update(ordersTable).set({ slipFilename: fn }).where(eq(ordersTable.id, order.id)).returning();
        return res.status(201).json(fmt(u));
      }
    }
    return res.status(201).json(fmt(order));
  } catch {
    return res.status(500).json({ error: "ไม่สามารถสร้างคำสั่งซื้อได้" });
  }
});

// GET /orders/my — member's own orders
router.get("/my", authenticate, async (req, res) => {
  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.userId, req.user!.userId)).orderBy(desc(ordersTable.createdAt));
    return res.json(rows.map((o) => fmt(o)));
  } catch {
    return res.status(500).json({ error: "Failed to list orders" });
  }
});

// GET /orders/admin/pending-count — orders needing admin action (for the nav badge)
router.get("/admin/pending-count", authenticate, requireAdmin, async (_req, res) => {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(inArray(ordersTable.status, ["pending", "paid"]));
    return res.json({ count });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

// GET /orders/admin/revenue — sales revenue summary (counts received money only)
router.get("/admin/revenue", authenticate, requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(ordersTable);
    const todayStr = bkkDay.format(new Date());
    const monthStr = todayStr.slice(0, 7);
    let totalRevenue = 0, todayRevenue = 0, monthRevenue = 0, pendingRevenue = 0;
    const counts: Record<string, number> = { pending: 0, paid: 0, shipped: 0, cancelled: 0 };
    const productAgg: Record<string, { name: string; qty: number; revenue: number }> = {};

    for (const o of rows) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
      const amount = Number(o.subtotal);
      if (o.status === "paid" || o.status === "shipped") {
        totalRevenue += amount;
        const when = o.paidAt ?? o.createdAt;
        const day = bkkDay.format(when);
        if (day === todayStr) todayRevenue += amount;
        if (day.slice(0, 7) === monthStr) monthRevenue += amount;
        try {
          for (const it of JSON.parse(o.items || "[]")) {
            const k = String(it.productId ?? it.name);
            if (!productAgg[k]) productAgg[k] = { name: it.name, qty: 0, revenue: 0 };
            productAgg[k].qty += it.qty;
            productAgg[k].revenue += it.price * it.qty;
          }
        } catch { /* ignore */ }
      } else if (o.status === "pending") {
        pendingRevenue += amount;
      }
    }
    const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    return res.json({
      totalRevenue, todayRevenue, monthRevenue, pendingRevenue,
      paidOrders: counts.paid + counts.shipped, counts, topProducts,
    });
  } catch {
    return res.status(500).json({ error: "Failed to compute revenue" });
  }
});

// GET /orders — admin: all orders (optional ?status=)
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await db
      .select({ order: ordersTable, user: usersTable })
      .from(ordersTable)
      .innerJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .where(status ? eq(ordersTable.status, status) : undefined)
      .orderBy(desc(ordersTable.createdAt))
      .limit(300);
    return res.json(rows.map((r) => fmt(r.order, r.user)));
  } catch {
    return res.status(500).json({ error: "Failed to list orders" });
  }
});

// GET /orders/:id — owner or admin
router.get("/:id", authenticate, async (req, res) => {
  try {
    const [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, parseInt(req.params.id))).limit(1);
    if (!o) return res.status(404).json({ error: "Order not found" });
    if (!isAdminRole(req.user!.role) && o.userId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });
    return res.json(fmt(o));
  } catch {
    return res.status(500).json({ error: "Failed to get order" });
  }
});

// PATCH /orders/:id — admin: update status / tracking
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, trackingNo } = req.body;
    const [prev] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!prev) return res.status(404).json({ error: "Order not found" });
    const updates: Partial<typeof ordersTable.$inferInsert> = {};
    if (status) {
      updates.status = status;
      if (status === "paid") updates.paidAt = prev.paidAt ?? new Date();
      if (status === "shipped") updates.shippedAt = new Date();
    }
    if (trackingNo !== undefined) updates.trackingNo = trackingNo || null;
    const [o] = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();
    // record revenue the first time an order is marked paid (wasn't already paid/shipped)
    if (status === "paid" && prev.status !== "paid" && prev.status !== "shipped") await logSale(o);
    return res.json(fmt(o));
  } catch {
    return res.status(500).json({ error: "Failed to update order" });
  }
});

export default router;
