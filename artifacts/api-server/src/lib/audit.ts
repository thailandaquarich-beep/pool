import type { NextFunction, Request, Response } from "express";
import { auditLogsTable, db } from "@workspace/db";
import { verifyToken, type JwtPayload } from "./jwt.js";
import { requestIp } from "../middlewares/security.js";

type AuditInput = {
  req: Request;
  user?: JwtPayload | null;
  action: string;
  statusCode: number;
  targetType?: string | null;
  targetId?: string | number | null;
  metadata?: Record<string, unknown>;
};

const SKIP_PATHS = [
  "/api/healthz",
  "/api/notifications/stream",
  "/api/theme/stream",
];

function bearerPayload(req: Request): JwtPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    return verifyToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

function safeQuery(query: Request["query"]): Record<string, unknown> | undefined {
  const entries = Object.entries(query)
    .filter(([key]) => !["password", "token", "authorization"].includes(key.toLowerCase()))
    .slice(0, 20);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function targetFromPath(path: string): { targetType?: string; targetId?: string } {
  const parts = path.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
    return { targetType: parts[0], targetId: parts[1] };
  }
  if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
    return { targetType: `${parts[0]}/${parts[1]}`, targetId: parts[2] };
  }
  return { targetType: parts[0] };
}

function actionFor(req: Request, statusCode: number): string {
  const path = req.originalUrl.split("?")[0] || req.path;
  if (path === "/api/auth/me") return "session_check";
  if (path === "/api/auth/logout") return "logout";
  if (path.startsWith("/api/backup")) return "backup_access";
  if (path.startsWith("/api/audit-logs")) return "audit_log_access";
  if (path.startsWith("/api/checkin")) return "checkin";
  if (path.startsWith("/api/topup")) return "topup";
  if (path.startsWith("/api/wallet")) return "wallet";
  if (path.startsWith("/api/orders")) return "order";
  if (path.startsWith("/api/reservations")) return "reservation";
  if (path.startsWith("/api/users")) return "user";
  if (path.startsWith("/api/packages")) return "package";
  if (path.startsWith("/api/instructors")) return "instructor";
  if (path.startsWith("/api/tasks")) return "staff_task";
  if (path.startsWith("/api/attendance")) return "attendance";
  if (path.startsWith("/api/leave")) return "leave";
  if (statusCode >= 400) return "request_failed";
  return `${req.method.toLowerCase()}_request`;
}

export async function recordAudit({ req, user, action, statusCode, targetType, targetId, metadata }: AuditInput) {
  try {
    const path = req.originalUrl.split("?")[0] || req.path;
    await db.insert(auditLogsTable).values({
      actorUserId: user?.userId ?? null,
      actorUsername: user?.username ?? null,
      actorRole: user?.role ?? null,
      action,
      method: req.method,
      path,
      statusCode,
      ip: requestIp(req),
      userAgent: req.header("user-agent") || null,
      requestId: req.id ? String(req.id) : null,
      targetType: targetType ?? null,
      targetId: targetId == null ? null : String(targetId),
      metadata,
    });
  } catch {
    // Audit logging must never break the user's main action.
  }
}

export function auditRequests() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api") || SKIP_PATHS.includes(req.path)) return next();
    const startedAt = Date.now();
    const tokenPayload = bearerPayload(req);

    res.on("finish", () => {
      const user = req.user ?? tokenPayload;
      // Anonymous public reads are intentionally skipped; login attempts are logged in auth.ts.
      if (!user) return;
      const path = req.originalUrl.split("?")[0] || req.path;
      const target = targetFromPath(path);
      void recordAudit({
        req,
        user,
        action: actionFor(req, res.statusCode),
        statusCode: res.statusCode,
        targetType: target.targetType,
        targetId: target.targetId,
        metadata: {
          durationMs: Date.now() - startedAt,
          query: safeQuery(req.query),
          branchHeader: req.header("x-branch-id") || undefined,
        },
      });
    });

    return next();
  };
}
