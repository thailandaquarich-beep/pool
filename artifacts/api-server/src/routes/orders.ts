import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { db, ordersTable, productsTable, usersTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { authenticate, requireAdmin, isAdminRole } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";
import { dataDirs } from "../lib/dataPaths.js";
import { appendMemberLog } from "../lib/memberLog.js";
import { memberCode } from "../lib/memberCode.js";
import { appendEncryptedLine, writeEncryptedFile } from "../lib/cryptoVault.js";

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
    await appendEncryptedLine(path.join(dataDirs.sales, `sales-${today.slice(0, 7)}.jsonl`), JSON.stringify(entry) + "\n");
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
    await writeEncryptedFile(path.join(dataDirs.slips, filename), buf.toString("base64"));
    return `${filename}.enc`;
  } catch { return null; }
}

// POST /orders — member places an order (cart checkout)
router.post("/", authenticate, attachBranch, async (req, res) => {
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

    // Stock check (only for products that track stock)
    for (const li of lineItems) {
      const p = byId[li.productId];
      if (p.stock != null && p.stock < li.qty) {
        return res.status(400).json({ error: `"${p.name}" มีสินค้าไม่พอ (เหลือ ${p.stock} ชิ้น)` });
      }
    }

    const paid = typeof slipImageUrl === "string" && slipImageUrl.startsWith("data:");
    // Insert the order and reserve stock atomically
    const order = await db.transaction(async (tx) => {
      const [o] = await tx
        .insert(ordersTable)
        .values({
          userId: req.user!.userId,
          items: JSON.stringify(lineItems),
          subtotal: String(subtotal),
          status: paid ? "paid" : "pending",
          branchId: newRowBranch(req),
          recipientName, phone, address,
          subdistrict: subdistrict || null, district: district || null, province: province || null, zipcode: zipcode || null,
          slipImageUrl: typeof slipImageUrl === "string" ? slipImageUrl : null,
          note: note || null,
          paidAt: paid ? new Date() : null,
        })
        .returning();
      for (const li of lineItems) {
        if (byId[li.productId].stock != null) {
          await tx.update(productsTable)
            .set({ stock: sql`GREATEST(${productsTable.stock} - ${li.qty}, 0)` })
            .where(eq(productsTable.id, li.productId));
        }
      }
      return o;
    });

    await appendMemberLog({ userId: req.user!.userId }, "activity", {
      action: "order", orderId: order.id, subtotal, itemCount: lineItems.length, status: order.status,
    });

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
router.get("/admin/pending-count", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(and(inArray(ordersTable.status, ["pending", "paid"]), branchEq(req, ordersTable.branchId)));
    return res.json({ count });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

// GET /orders/admin/revenue — sales revenue summary (counts received money only)
router.get("/admin/revenue", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const rows = await db.select().from(ordersTable).where(branchEq(req, ordersTable.branchId));
    const packageTransactions = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "package_purchase"), eq(transactionsTable.status, "completed"), branchEq(req, transactionsTable.branchId)));
    const todayStr = bkkDay.format(new Date());
    const monthStr = todayStr.slice(0, 7);
    let totalRevenue = 0, todayRevenue = 0, monthRevenue = 0, pendingRevenue = 0;
    let packageRevenue = 0, packageTodayRevenue = 0, packageMonthRevenue = 0;
    const counts: Record<string, number> = { pending: 0, paid: 0, shipped: 0, cancelled: 0 };
    const productAgg: Record<string, { name: string; qty: number; revenue: number }> = {};
    const packageAgg: Record<string, { name: string; qty: number; revenue: number }> = {};

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
    for (const t of packageTransactions) {
      const amount = Number(t.amount);
      packageRevenue += amount;
      const day = bkkDay.format(t.createdAt);
      if (day === todayStr) packageTodayRevenue += amount;
      if (day.slice(0, 7) === monthStr) packageMonthRevenue += amount;
      const name = t.description.replace(/^Admin package:\s*/i, "").replace(/^เธเธทเนเธญเนเธเนเธเน€เธเธ:\s*/i, "").trim() || "Package";
      if (!packageAgg[name]) packageAgg[name] = { name, qty: 0, revenue: 0 };
      packageAgg[name].qty += 1;
      packageAgg[name].revenue += amount;
    }
    const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const topPackages = Object.values(packageAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    return res.json({
      totalRevenue, todayRevenue, monthRevenue, pendingRevenue,
      packageRevenue, packageTodayRevenue, packageMonthRevenue,
      paidOrders: counts.paid + counts.shipped, counts, topProducts, topPackages,
    });
  } catch {
    return res.status(500).json({ error: "Failed to compute revenue" });
  }
});

// GET /orders/admin/history — admin: ONE unified purchase history combining product
// orders + membership-package purchases, newest first, with buyer name + member code.
// Powers both the on-screen "ประวัติการซื้อ" table and the combined CSV download.
router.get("/admin/history", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable).where(branchEq(req, ordersTable.branchId));
    const txns = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "package_purchase"), branchEq(req, transactionsTable.branchId)));

    const userIds = [...new Set([...orders.map((o) => o.userId), ...txns.map((t) => t.userId)].filter((x): x is number => x != null))];
    const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    type Row = {
      type: "product" | "package"; typeLabel: string; id: number; createdAt: Date;
      buyerName: string; memberCode: string; phone: string; itemSummary: string;
      amount: number; status: string;
    };
    const rows: Row[] = [];

    for (const o of orders) {
      const u = o.userId != null ? byId.get(o.userId) : undefined;
      let items = "";
      try { items = JSON.parse(o.items || "[]").map((it: any) => `${it.name}×${it.qty}`).join(", "); } catch { /* ignore */ }
      rows.push({
        type: "product", typeLabel: "สินค้า", id: o.id, createdAt: o.createdAt,
        buyerName: u ? `${u.firstName} ${u.lastName}` : (o.recipientName || "-"),
        memberCode: u ? memberCode(u.id, u.phone) : "", phone: u?.phone || o.phone || "",
        itemSummary: items || "-", amount: Number(o.subtotal), status: o.status,
      });
    }
    for (const t of txns) {
      const u = byId.get(t.userId);
      rows.push({
        type: "package", typeLabel: "แพ็กเกจ", id: t.id, createdAt: t.createdAt,
        buyerName: u ? `${u.firstName} ${u.lastName}` : "-",
        memberCode: u ? memberCode(u.id, u.phone) : "", phone: u?.phone || "",
        itemSummary: t.description.replace(/^Admin package:\s*/i, "").trim() || "แพ็กเกจสมาชิก",
        amount: Number(t.amount), status: t.status,
      });
    }

    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch {
    return res.status(500).json({ error: "Failed to build purchase history" });
  }
});

// GET /orders — admin: all orders (optional ?status=)
router.get("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await db
      .select({ order: ordersTable, user: usersTable })
      .from(ordersTable)
      .innerJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .where(and(branchEq(req, ordersTable.branchId), status ? eq(ordersTable.status, status) : undefined))
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
    // restore reserved stock when an order is cancelled (only once)
    if (status === "cancelled" && prev.status !== "cancelled") {
      try {
        for (const li of JSON.parse(prev.items || "[]") as { productId: number; qty: number }[]) {
          if (li.productId) {
            await db.update(productsTable)
              .set({ stock: sql`${productsTable.stock} + ${li.qty}` })
              .where(and(eq(productsTable.id, li.productId), sql`${productsTable.stock} IS NOT NULL`));
          }
        }
      } catch { /* ignore */ }
    }
    return res.json(fmt(o));
  } catch {
    return res.status(500).json({ error: "Failed to update order" });
  }
});

export default router;
