import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, branchEq, newRowBranch } from "../middlewares/branch.js";

const router = Router();

const fmt = (p: typeof productsTable.$inferSelect) => ({ ...p, price: Number(p.price) });

// GET /products — public: active products
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.isActive, true))
      .orderBy(productsTable.sortOrder, productsTable.name);
    return res.json(rows.map(fmt));
  } catch {
    return res.status(500).json({ error: "Failed to list products" });
  }
});

// GET /products/all — admin: include inactive
router.get("/all", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const rows = await db.select().from(productsTable).where(branchEq(req, productsTable.branchId)).orderBy(productsTable.sortOrder, productsTable.name);
    return res.json(rows.map(fmt));
  } catch {
    return res.status(500).json({ error: "Failed to list products" });
  }
});

// POST /products — admin
router.post("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const { name, nameEn, category, description, price, imageUrl, stock, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const [row] = await db
      .insert(productsTable)
      .values({
        name, nameEn: nameEn || null, category: category || null, description: description || null,
        price: String(price ?? 0), imageUrl: imageUrl || null,
        stock: stock != null && stock !== "" ? Number(stock) : null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        branchId: newRowBranch(req),
      })
      .returning();
    return res.status(201).json(fmt(row));
  } catch {
    return res.status(500).json({ error: "Failed to create product" });
  }
});

// PATCH /products/:id — admin
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates: Partial<typeof productsTable.$inferInsert> = {};
    const fields = ["name", "nameEn", "category", "description", "imageUrl", "isActive"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
    }
    if (req.body.price !== undefined) updates.price = String(req.body.price);
    if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder);
    if (req.body.stock !== undefined) updates.stock = req.body.stock === "" || req.body.stock === null ? null : Number(req.body.stock);
    const [row] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Product not found" });
    return res.json(fmt(row));
  } catch {
    return res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE /products/:id — admin: permanently delete (orders keep a JSON snapshot, so no FK to break)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const [row] = await db.delete(productsTable).where(eq(productsTable.id, parseInt(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: "Product not found" });
    return res.json({ message: "Product deleted" });
  } catch {
    return res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
