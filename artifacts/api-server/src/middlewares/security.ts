import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  key?: (req: Request) => string;
  skip?: (req: Request) => boolean;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();
const DEFAULT_LOCAL_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function envList(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requestIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || req.ip || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim() || req.ip || "unknown";
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function corsOptions(): CorsOptions {
  const allowed = new Set([...DEFAULT_LOCAL_ORIGINS, ...envList("CORS_ORIGINS"), ...envList("FRONTEND_ORIGINS")]);

  return {
    credentials: true,
    origin(origin, callback) {
      // Native apps, curl/server-to-server, and same-origin proxy requests often do not send Origin.
      if (!origin) return callback(null, true);
      return callback(null, allowed.has(origin));
    },
  };
}

export function securityHeaders() {
  const isProduction = process.env.NODE_ENV === "production";
  const cspConnect = isProduction
    ? "'self'"
    : "'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*";

  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    `connect-src ${cspConnect}`,
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "form-action 'self'",
  ].join("; ");

  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    next();
  };
}

export function noStoreForSensitiveRoutes() {
  const sensitivePrefixes = [
    "/api/auth",
    "/api/backup",
    "/api/users",
    "/api/wallet",
    "/api/topup",
    "/api/orders",
    "/api/reservations",
    "/api/packages",
    "/api/checkin",
    "/api/attendance",
    "/api/leave",
    "/api/tasks",
    "/api/audit-logs",
  ];

  return (req: Request, res: Response, next: NextFunction) => {
    if (sensitivePrefixes.some((prefix) => req.path.startsWith(prefix))) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  };
}

export function intrusionGuard() {
  const suspiciousPath = /(\0|%00|\.\.|%2e%2e|\/\.env|\/wp-admin|\/wp-login|\/phpmyadmin|\/vendor\/phpunit)/i;

  return (req: Request, res: Response, next: NextFunction) => {
    const originalUrl = req.originalUrl || req.url || "";
    if (originalUrl.length > 4096) {
      return res.status(414).json({ error: "uri_too_long", message: "URL ยาวเกินกำหนด" });
    }
    if (suspiciousPath.test(originalUrl)) {
      return res.status(400).json({ error: "blocked_request", message: "คำขอถูกปฏิเสธเพื่อความปลอดภัย" });
    }
    return next();
  };
}

export function rateLimit({ windowMs, max, keyPrefix, key, skip }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) return next();
    const now = Date.now();
    const rawKey = key ? key(req) : requestIp(req);
    const bucketKey = `${keyPrefix}:${rawKey}`;
    const existing = rateBuckets.get(bucketKey);
    const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    rateBuckets.set(bucketKey, bucket);

    const remaining = Math.max(0, max - bucket.count);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "rate_limited",
        message: "คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
        retryAfter,
      });
    }

    if (rateBuckets.size > 10_000 && Math.random() < 0.02) {
      for (const [entryKey, value] of rateBuckets.entries()) {
        if (value.resetAt <= now) rateBuckets.delete(entryKey);
      }
    }

    return next();
  };
}

export function clearRateLimit(keyPrefix: string, key: string) {
  rateBuckets.delete(`${keyPrefix}:${key}`);
}
