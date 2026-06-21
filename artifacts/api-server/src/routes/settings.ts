import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth.js";
import { attachBranch, newRowBranch } from "../middlewares/branch.js";

const router = Router();

// Per-branch settings: one settings row per branch (hours, capacity, maintenance,
// bank/PromptPay). Falls back to creating defaults the first time a branch is touched.
async function getOrCreateSettings(branchId: number) {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.branchId, branchId)).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(settingsTable).values({ branchId }).returning();
  return created;
}

// GET /settings
router.get("/", authenticate, attachBranch, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(newRowBranch(req));
    return res.json(settings);
  } catch {
    return res.status(500).json({ error: "Failed to get settings" });
  }
});

// PATCH /settings — admin only
router.patch("/", authenticate, requireAdmin, attachBranch, async (req, res) => {
  try {
    const existing = await getOrCreateSettings(newRowBranch(req));
    const {
      bookingEnabled,
      openTime,
      closeTime,
      maxPeoplePerSlot,
      maxAdvanceDays,
      slotDurationMinutes,
      maintenanceMode,
      maintenanceMessage,
      bookingPricePerSession,
      bookingAutoConfirm,
      lineUrl,
      contactPhone,
      contactEmail,
      bankAccountName,
      bankAccountNumber,
      bankName,
      promptpayNumber,
    } = req.body;

    const updates: Partial<typeof settingsTable.$inferInsert> = {};
    if (bookingEnabled !== undefined) updates.bookingEnabled = bookingEnabled;
    if (openTime) updates.openTime = openTime;
    if (closeTime) updates.closeTime = closeTime;
    if (maxPeoplePerSlot) updates.maxPeoplePerSlot = maxPeoplePerSlot;
    if (maxAdvanceDays) updates.maxAdvanceDays = maxAdvanceDays;
    if (slotDurationMinutes) updates.slotDurationMinutes = slotDurationMinutes;
    if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
    if (maintenanceMessage !== undefined) updates.maintenanceMessage = maintenanceMessage;
    if (bookingPricePerSession !== undefined) updates.bookingPricePerSession = String(bookingPricePerSession);
    if (bookingAutoConfirm !== undefined) updates.bookingAutoConfirm = bookingAutoConfirm;
    if (lineUrl !== undefined) updates.lineUrl = lineUrl;
    if (contactPhone !== undefined) updates.contactPhone = contactPhone;
    if (contactEmail !== undefined) updates.contactEmail = contactEmail;
    if (bankAccountName !== undefined) updates.bankAccountName = bankAccountName;
    if (bankAccountNumber !== undefined) updates.bankAccountNumber = bankAccountNumber;
    if (bankName !== undefined) updates.bankName = bankName;
    if (promptpayNumber !== undefined) updates.promptpayNumber = promptpayNumber;

    const [updated] = await db
      .update(settingsTable)
      .set(updates)
      .where(eq(settingsTable.id, existing.id))
      .returning();

    return res.json(updated || existing);
  } catch {
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
