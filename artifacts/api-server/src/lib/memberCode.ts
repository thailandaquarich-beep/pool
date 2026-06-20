// Member number derived from registration order (the serial id). First registrant = ART00001.
export function memberCode(id: number): string {
  return `ART${String(id).padStart(5, "0")}`;
}
