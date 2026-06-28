// Member code follows the member's phone number. Fall back to the legacy serial
// code only for old/incomplete records that do not have a phone value.
export function memberCode(id: number, phone?: string | null): string {
  const value = String(phone || "").trim();
  if (value) return value;
  return `ART${String(id).padStart(5, "0")}`;
}
