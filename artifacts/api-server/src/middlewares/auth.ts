import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// admin and super_admin both have administrative privileges.
export function isAdminRole(role?: string): boolean {
  return role === "admin" || role === "super_admin";
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ error: "Forbidden: admin only" });
  }
  next();
}

// Staff = anyone who works here (admins + instructors + employees). Used by the attendance system.
export function isStaffRole(role?: string): boolean {
  return role === "admin" || role === "super_admin" || role === "instructor" || role === "staff";
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isStaffRole(req.user.role)) {
    return res.status(403).json({ error: "Forbidden: staff only" });
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
  } catch {
    // ignore invalid token
  }
  next();
}
