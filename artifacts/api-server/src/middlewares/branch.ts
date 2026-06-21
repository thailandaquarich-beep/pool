import type { Request, Response, NextFunction } from "express";
import type { Column, SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      /** Branch this request operates within. null = all branches (super_admin, no filter). */
      branchId?: number | null;
      /** The caller's own branch id (always their home branch). */
      userBranchId?: number | null;
      isSuperAdmin?: boolean;
    }
  }
}

/**
 * Resolves the caller's branch context (run AFTER `authenticate`).
 *
 * - super_admin: spans all branches. May target one branch via the `X-Branch-Id`
 *   header (the branch switcher); `X-Branch-Id: all` or absent → null (every branch).
 * - everyone else: hard-confined to their own branch, header ignored.
 */
export async function attachBranch(req: Request, _res: Response, next: NextFunction) {
  try {
    const isSuper = req.user?.role === "super_admin";
    req.isSuperAdmin = isSuper;

    let userBranchId: number | null = null;
    if (req.user?.userId) {
      const [u] = await db.select({ b: usersTable.branchId }).from(usersTable).where(eq(usersTable.id, req.user.userId)).limit(1);
      userBranchId = u?.b ?? null;
    }
    req.userBranchId = userBranchId;

    if (isSuper) {
      const hdr = req.header("x-branch-id");
      req.branchId = hdr && hdr !== "all" ? (Number.isNaN(parseInt(hdr)) ? null : parseInt(hdr)) : null;
    } else {
      req.branchId = userBranchId ?? 1;
    }
    next();
  } catch {
    // Never block the request on branch resolution; fall back to "no scope".
    req.branchId = req.isSuperAdmin ? null : 1;
    next();
  }
}

/**
 * Drizzle condition that scopes a query to the request's branch, or `undefined`
 * (no filter) when super_admin is viewing all branches. `and(...conds, branchEq(...))`
 * is safe because drizzle's `and()` ignores undefined.
 */
export function branchEq(req: Request, col: Column): SQL | undefined {
  if (req.branchId == null) return undefined;
  return eq(col, req.branchId);
}

/** The branch id to stamp on a new row (super_admin defaults to main when none chosen). */
export function newRowBranch(req: Request): number {
  return req.branchId ?? req.userBranchId ?? 1;
}
