// Site-wide theme accent color. GET + SSE are PUBLIC (so logged-out pages recolor too);
// PATCH is admin-only. A version counter lets the SSE stream push changes in ~realtime.
import { Router } from "express";
import { db, appThemeTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";

const router = Router();

let version = 0; // bumped on every save → SSE clients detect & re-pull

async function getRow() {
  const [row] = await db.select().from(appThemeTable).where(eq(appThemeTable.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(appThemeTable).values({ id: 1, data: null }).returning();
  return created;
}

const asColor = (o: any) =>
  o && typeof o.h === "number" && typeof o.s === "number" && typeof o.l === "number"
    ? { h: Math.round(o.h), s: Math.round(o.s), l: Math.round(o.l) }
    : null;

function parse(data: string | null): { color: { h: number; s: number; l: number } | null; font: string | null } {
  if (!data) return { color: null, font: null };
  try {
    const v = JSON.parse(data);
    if (v && (v.color !== undefined || v.font !== undefined)) {
      return { color: asColor(v.color), font: typeof v.font === "string" && v.font ? v.font : null };
    }
    return { color: asColor(v), font: null }; // legacy { h, s, l }
  } catch {
    return { color: null, font: null };
  }
}

// GET /theme — public: current accent color + font + version
router.get("/", async (_req, res) => {
  try {
    const row = await getRow();
    return res.json({ ...parse(row.data), version });
  } catch {
    return res.json({ color: null, font: null, version });
  }
});

// GET /theme/stream — public SSE: pushes the color whenever it changes
router.get("/stream", async (req, res) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  let lastSent = -1;
  const tick = async () => {
    if (lastSent === version) return;
    try {
      const row = await getRow();
      lastSent = version;
      res.write(`data: ${JSON.stringify({ ...parse(row.data), version })}\n\n`);
    } catch { /* ignore one tick */ }
  };
  await tick();
  const iv = setInterval(tick, 2000);
  req.on("close", () => clearInterval(iv));
});

// PATCH /theme — admin: set color and/or font (null clears), merge with existing, broadcast
router.patch("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const row = await getRow();
    const cur = parse(row.data);
    let color = cur.color;
    let font = cur.font;
    if ("color" in req.body) color = asColor(req.body.color);
    if ("font" in req.body) font = typeof req.body.font === "string" && req.body.font ? req.body.font : null;
    const data = JSON.stringify({ color, font });
    await db.update(appThemeTable).set({ data, updatedAt: new Date() }).where(eq(appThemeTable.id, 1));
    version++;
    return res.json({ color, font, version });
  } catch {
    return res.status(500).json({ error: "Failed to save theme" });
  }
});

export default router;
