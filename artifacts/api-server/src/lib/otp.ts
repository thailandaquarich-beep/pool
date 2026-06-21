import crypto from "node:crypto";

/**
 * Email OTP store — in-memory (single-instance API), keyed by lowercased email.
 * 6-digit codes, 10-minute TTL, max 5 verify attempts, 60s resend cooldown.
 */

type Entry = { code: string; expires: number; attempts: number; lastSent: number };
const store = new Map<string, Entry>();

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const key = (email: string) => email.trim().toLowerCase();

function sweep() {
  const now = Date.now();
  for (const [k, e] of store) if (e.expires < now) store.delete(k);
}

/** Seconds the caller must wait before a resend is allowed (0 = allowed now). */
export function resendWait(email: string): number {
  const e = store.get(key(email));
  if (!e) return 0;
  const left = RESEND_COOLDOWN_MS - (Date.now() - e.lastSent);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Create (or refresh) an OTP for an email and return the 6-digit code. */
export function createOtp(email: string): string {
  sweep();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  store.set(key(email), { code, expires: Date.now() + TTL_MS, attempts: 0, lastSent: Date.now() });
  return code;
}

export type OtpResult = "ok" | "missing" | "expired" | "locked" | "mismatch";

/** Verify a code. On success the entry is consumed. */
export function verifyOtp(email: string, code: string): OtpResult {
  const k = key(email);
  const e = store.get(k);
  if (!e) return "missing";
  if (e.expires < Date.now()) { store.delete(k); return "expired"; }
  if (e.attempts >= MAX_ATTEMPTS) { store.delete(k); return "locked"; }
  if (e.code !== String(code).trim()) { e.attempts += 1; return "mismatch"; }
  store.delete(k); // consume on success
  return "ok";
}
