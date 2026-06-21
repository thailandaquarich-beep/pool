import type { Request } from "express";
import { appendMemberLog } from "./memberLog.js";

// Captures *who/where/what* a member is connecting from, for the per-member
// activity log. A browser cannot read a real machine HWID, so the "hwid" we
// store is a client-generated device fingerprint (see device-id.ts on the web
// side). Everything here is best-effort and must never break a request.

export interface DeviceInfo {
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  deviceModel: string | null;
}

export interface NetworkInfo {
  ip: string | null;
  ipVersion: "ipv4" | "ipv6" | null;
  isp: string | null;
  org: string | null;
  as: string | null;
  // "mobile" | "hosting" | "proxy" | "broadband" | null
  connectionType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

// ---------------------------------------------------------------------------
// Client IP — behind a Cloudflare quick tunnel the real visitor IP arrives in
// CF-Connecting-IP; fall back to the usual proxy headers, then the socket.
// ---------------------------------------------------------------------------
export function clientIp(req: Request): string | null {
  const cf = req.header("cf-connecting-ip");
  if (cf) return normalizeIp(cf.trim());
  const xff = req.header("x-forwarded-for");
  if (xff) return normalizeIp(xff.split(",")[0]!.trim());
  const real = req.header("x-real-ip");
  if (real) return normalizeIp(real.trim());
  return normalizeIp(req.socket?.remoteAddress ?? null);
}

function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) -> plain IPv4
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped ? mapped[1]! : ip;
}

function ipVersion(ip: string | null): "ipv4" | "ipv6" | null {
  if (!ip) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return "ipv4";
  if (ip.includes(":")) return "ipv6";
  return null;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "localhost" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    /^f[cd]/i.test(ip)
  );
}

// ---------------------------------------------------------------------------
// User-Agent → coarse OS / browser / device. Compact on purpose (no dep):
// covers the mainstream Windows/macOS/iOS/Android/Linux + Chrome/Edge/Firefox/
// Safari/Opera/Samsung combos members actually use.
// ---------------------------------------------------------------------------
export function parseUserAgent(ua: string): DeviceInfo {
  const out: DeviceInfo = {
    os: null, osVersion: null, browser: null, browserVersion: null,
    deviceType: "unknown", deviceModel: null,
  };
  if (!ua) return out;

  if (/bot|crawler|spider|crawling|facebookexternalhit|slurp/i.test(ua)) {
    out.deviceType = "bot";
  }

  let m: RegExpExecArray | null;
  // OS
  if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
    out.os = "Windows";
    const map: Record<string, string> = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
    out.osVersion = map[m[1]!] ?? m[1]!;
  } else if ((m = /(?:iPhone OS|CPU OS) ([\d_]+)/.exec(ua))) {
    out.os = "iOS"; out.osVersion = m[1]!.replace(/_/g, ".");
  } else if (/Android/.test(ua)) {
    out.os = "Android";
    m = /Android ([\d.]+)/.exec(ua); out.osVersion = m ? m[1]! : null;
  } else if ((m = /Mac OS X ([\d_]+)/.exec(ua))) {
    out.os = "macOS"; out.osVersion = m[1]!.replace(/_/g, ".");
  } else if (/Linux/.test(ua)) {
    out.os = "Linux";
  }

  // Device type + model
  if (/iPad/.test(ua)) { out.deviceType = "tablet"; out.deviceModel = "iPad"; }
  else if (/iPhone/.test(ua)) { out.deviceType = "mobile"; out.deviceModel = "iPhone"; }
  else if (/Android/.test(ua)) {
    out.deviceType = /Mobile/.test(ua) ? "mobile" : "tablet";
    const mm = /Android [\d.]+; ?([^;)]+?)(?: Build\/|\))/.exec(ua);
    if (mm) out.deviceModel = mm[1]!.trim();
  } else if (out.deviceType !== "bot") {
    out.deviceType = "desktop";
  }

  // Browser (order matters — Edge/Opera masquerade as Chrome)
  if ((m = /Edg(?:A|iOS)?\/([\d.]+)/.exec(ua))) { out.browser = "Edge"; out.browserVersion = m[1]!; }
  else if ((m = /(?:OPR|Opera)\/([\d.]+)/.exec(ua))) { out.browser = "Opera"; out.browserVersion = m[1]!; }
  else if ((m = /SamsungBrowser\/([\d.]+)/.exec(ua))) { out.browser = "Samsung Internet"; out.browserVersion = m[1]!; }
  else if ((m = /Firefox\/([\d.]+)/.exec(ua))) { out.browser = "Firefox"; out.browserVersion = m[1]!; }
  else if ((m = /CriOS\/([\d.]+)/.exec(ua))) { out.browser = "Chrome"; out.browserVersion = m[1]!; }
  else if ((m = /Chrome\/([\d.]+)/.exec(ua))) { out.browser = "Chrome"; out.browserVersion = m[1]!; }
  else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) { out.browser = "Safari"; out.browserVersion = m[1]!; }
  else if (/Safari/.test(ua)) { out.browser = "Safari"; }

  return out;
}

// ---------------------------------------------------------------------------
// IP -> ISP / network info via ip-api.com (free, http-only). Cached per IP and
// time-boxed so a slow/down lookup never delays the caller. Private/LAN IPs are
// not sent off-box.
// ---------------------------------------------------------------------------
const NET_TTL_MS = 6 * 60 * 60 * 1000;
const netCache = new Map<string, { at: number; data: NetworkInfo }>();

export async function lookupNetwork(rawIp: string | null): Promise<NetworkInfo> {
  const ip = normalizeIp(rawIp);
  const base: NetworkInfo = {
    ip, ipVersion: ipVersion(ip), isp: null, org: null, as: null,
    connectionType: null, country: null, region: null, city: null,
  };
  if (!ip || isPrivateIp(ip)) return base;

  const cached = netCache.get(ip);
  if (cached && Date.now() - cached.at < NET_TTL_MS) return cached.data;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const url =
      `http://ip-api.com/json/${encodeURIComponent(ip)}` +
      `?fields=status,message,country,regionName,city,isp,org,as,mobile,proxy,hosting,query`;
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const j = (await resp.json()) as Record<string, unknown>;
    if (j["status"] === "success") {
      const data: NetworkInfo = {
        ip,
        ipVersion: ipVersion(ip),
        isp: (j["isp"] as string) || null,
        org: (j["org"] as string) || null,
        as: (j["as"] as string) || null,
        connectionType: j["mobile"] ? "mobile" : j["hosting"] ? "hosting" : j["proxy"] ? "proxy" : "broadband",
        country: (j["country"] as string) || null,
        region: (j["regionName"] as string) || null,
        city: (j["city"] as string) || null,
      };
      netCache.set(ip, { at: Date.now(), data });
      return data;
    }
  } catch {
    /* best-effort — fall through to base */
  }
  return base;
}

// ---------------------------------------------------------------------------
// Fire-and-forget: enrich + append one session line to the member's
// activity.jsonl. Safe to call without awaiting.
// ---------------------------------------------------------------------------
export async function logClientSession(
  userId: number,
  capture: { ip: string | null; userAgent: string; fingerprint: string | null },
  action: string,
): Promise<void> {
  const device = parseUserAgent(capture.userAgent);
  const network = await lookupNetwork(capture.ip);
  await appendMemberLog({ userId }, "activity", {
    action,
    hwid: capture.fingerprint || null,
    device,
    network,
    userAgent: capture.userAgent || null,
  });
}
