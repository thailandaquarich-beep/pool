// Normalise a phone number to E.164 (default region: Thailand +66).
// Accepts "081-234-5678", "0812345678", "+66812345678", "66812345678".
// Returns null when it can't be made into a plausible E.164 number.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim().replace(/[\s\-().]/g, "");

  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? "+" + digits : null;
  }

  s = s.replace(/\D/g, "");
  if (!s) return null;

  // Thai mobile/landline local format: 0XXXXXXXXX (10 digits) -> +66XXXXXXXXX
  if (s.length === 10 && s.startsWith("0")) return "+66" + s.slice(1);
  // Already with country code: 66XXXXXXXXX
  if (s.startsWith("66") && s.length >= 11) return "+" + s;
  // 9 significant digits, no leading 0 -> assume Thai
  if (s.length === 9) return "+66" + s;

  return null;
}
