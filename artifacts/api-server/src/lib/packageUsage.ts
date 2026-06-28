import { db, memberPackagesTable, membershipPackagesTable, packageUsagesTable } from "@workspace/db";
import { and, eq, asc } from "drizzle-orm";

// A usable form of a member's purchased package, with quota math applied.
// quota / remaining === null means "unlimited" (package has no maxBookingsPerMonth).
export type ActiveUsage = {
  memberPackage: typeof memberPackagesTable.$inferSelect;
  package: typeof membershipPackagesTable.$inferSelect;
  quota: number | null;
  used: number;
  remaining: number | null;
  expired: boolean;
};

export class NoQuotaError extends Error {
  constructor() {
    super("NO_QUOTA");
  }
}

type Exec = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// Active = status "active". By default only packages that are NOT past their end
// date are returned (the member-booking rule). Pass { includeExpired: true } for the
// admin desk flow: a paid session-course (e.g. "10 ครั้ง") that still has uses left
// must remain deductible by staff even after its date lapses, so the member doesn't
// lose sessions they already paid for. Each usage carries an `expired` flag so the UI
// can label it. Soonest-expiring first so we burn down the package that lapses earliest.
export async function getActiveUsages(
  exec: Exec,
  userId: number,
  opts: { includeExpired?: boolean } = {},
): Promise<ActiveUsage[]> {
  const now = new Date();
  const rows = await exec
    .select({ mp: memberPackagesTable, pkg: membershipPackagesTable })
    .from(memberPackagesTable)
    .innerJoin(membershipPackagesTable, eq(memberPackagesTable.packageId, membershipPackagesTable.id))
    .where(and(eq(memberPackagesTable.userId, userId), eq(memberPackagesTable.status, "active")))
    .orderBy(asc(memberPackagesTable.endDate));

  return rows
    .filter(({ mp }) => opts.includeExpired || new Date(mp.endDate) > now)
    .map(({ mp, pkg }) => {
      const quota = pkg.maxBookingsPerMonth ?? null;
      const used = mp.bookingsUsed;
      const remaining = quota === null ? null : Math.max(0, quota - used);
      return { memberPackage: mp, package: pkg, quota, used, remaining, expired: new Date(mp.endDate) <= now };
    });
}

// The auto-pick used when no specific package is chosen: prefer a non-expired package
// with uses left; only fall back to an expired-but-unused one if nothing else remains.
export function pickUsable(usages: ActiveUsage[]): ActiveUsage | null {
  const hasUse = (u: ActiveUsage) => u.remaining === null || u.remaining > 0;
  return usages.find((u) => !u.expired && hasUse(u)) ?? usages.find(hasUse) ?? null;
}

export async function hasQuota(exec: Exec, userId: number): Promise<boolean> {
  return pickUsable(await getActiveUsages(exec, userId)) !== null;
}

// Consume one use from the best usable package. Throws NoQuotaError if none available.
export async function consumeUse(
  exec: Exec,
  userId: number,
  opts: { source: "booking" | "checkin"; reservationId?: number | null; note?: string; memberPackageId?: number | null; allowExpired?: boolean },
) {
  const usages = await getActiveUsages(exec, userId, { includeExpired: opts.allowExpired });
  const usable = opts.memberPackageId
    ? usages.find((u) => u.memberPackage.id === opts.memberPackageId && (u.remaining === null || u.remaining > 0)) ?? null
    : pickUsable(usages);
  if (!usable) throw new NoQuotaError();

  await exec
    .update(memberPackagesTable)
    .set({ bookingsUsed: usable.memberPackage.bookingsUsed + 1 })
    .where(eq(memberPackagesTable.id, usable.memberPackage.id));

  const [usage] = await exec
    .insert(packageUsagesTable)
    .values({
      userId,
      memberPackageId: usable.memberPackage.id,
      reservationId: opts.reservationId ?? null,
      source: opts.source,
      note: opts.note ?? null,
    })
    .returning();

  return {
    usage,
    memberPackageId: usable.memberPackage.id,
    package: usable.package,
    remainingAfter: usable.remaining === null ? null : usable.remaining - 1,
  };
}

// Reverse a use tied to a reservation (on cancel). Safe to call when nothing was consumed.
export async function refundUseForReservation(exec: Exec, reservationId: number) {
  const [usage] = await exec
    .select()
    .from(packageUsagesTable)
    .where(eq(packageUsagesTable.reservationId, reservationId))
    .limit(1);
  if (!usage) return;

  const [mp] = await exec
    .select()
    .from(memberPackagesTable)
    .where(eq(memberPackagesTable.id, usage.memberPackageId))
    .limit(1);
  if (mp) {
    await exec
      .update(memberPackagesTable)
      .set({ bookingsUsed: Math.max(0, mp.bookingsUsed - 1) })
      .where(eq(memberPackagesTable.id, mp.id));
  }
  await exec.delete(packageUsagesTable).where(eq(packageUsagesTable.id, usage.id));
}
