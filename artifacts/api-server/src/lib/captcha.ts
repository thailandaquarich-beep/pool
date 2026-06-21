import crypto from "node:crypto";

/**
 * Self-hosted CAPTCHA — no external service, no API keys.
 * Generates a short distorted-text challenge as an SVG drawn on the server.
 * Answers are kept in-memory (single-instance API), single-use, 5-minute TTL.
 */

type Entry = { answer: string; expires: number };
const store = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000;

// Unambiguous alphabet — no 0/O, 1/I/L, etc.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const COLORS = ["#0ea5b7", "#2563eb", "#0891b2", "#d4a017", "#e0a106"]; // aqua + gold

const rint = (n: number) => crypto.randomInt(0, n);
const pick = <T,>(arr: T[]): T => arr[rint(arr.length)];

function code(len = 5): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[rint(CHARS.length)];
  return s;
}

function renderSvg(text: string): string {
  const w = 170, h = 60;
  const chars = text.split("").map((ch, i) => {
    const x = 22 + i * 28 + rint(6);
    const y = 38 + rint(10);
    const rot = rint(40) - 20;
    const size = 30 + rint(6);
    return `<text x="${x}" y="${y}" font-family="Verdana, sans-serif" font-size="${size}" font-weight="700" fill="${pick(COLORS)}" transform="rotate(${rot} ${x} ${y})">${ch}</text>`;
  }).join("");

  // noise: wavy lines + dots
  let noise = "";
  for (let i = 0; i < 4; i++) {
    noise += `<line x1="${rint(w)}" y1="${rint(h)}" x2="${rint(w)}" y2="${rint(h)}" stroke="${pick(COLORS)}" stroke-width="1" opacity="0.5"/>`;
  }
  for (let i = 0; i < 22; i++) {
    noise += `<circle cx="${rint(w)}" cy="${rint(h)}" r="1" fill="${pick(COLORS)}" opacity="0.5"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="captcha">` +
    `<rect width="${w}" height="${h}" rx="10" fill="#f0f7fb"/>${noise}${chars}</svg>`;
}

function sweep() {
  const now = Date.now();
  for (const [id, e] of store) if (e.expires < now) store.delete(id);
}

/** Create a new challenge. Returns an id (sent back on verify) and the SVG markup. */
export function generateCaptcha(): { id: string; svg: string } {
  sweep();
  const id = crypto.randomUUID();
  const answer = code();
  store.set(id, { answer: answer.toLowerCase(), expires: Date.now() + TTL_MS });
  return { id, svg: renderSvg(answer) };
}

/** Verify and consume a challenge (case-insensitive). One attempt per id. */
export function verifyCaptcha(id: string, answer: string): boolean {
  if (!id || !answer) return false;
  const entry = store.get(id);
  if (!entry) return false;
  store.delete(id); // single-use regardless of outcome
  if (entry.expires < Date.now()) return false;
  return entry.answer === String(answer).trim().toLowerCase();
}
