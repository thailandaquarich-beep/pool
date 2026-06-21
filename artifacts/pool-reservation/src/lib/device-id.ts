// A browser cannot read a real machine HWID, so we derive a stable per-device
// fingerprint from browser/hardware traits and persist it in localStorage. It is
// sent with auth requests as a pseudo-HWID so the server can tell devices apart.

const KEY = "pool_device_id";

// FNV-1a 32-bit -> 8 hex chars. Tiny, sync, good enough for a fingerprint.
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

// Canvas rendering differs subtly by GPU/driver/font stack — adds entropy.
function canvasHash(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 220;
    c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "0";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Aquarich-อควาริช-🐟", 2, 2);
    ctx.fillStyle = "rgba(102,200,0,0.7)";
    ctx.fillText("Aquarich-อควาริช-🐟", 4, 6);
    return fnv1a(c.toDataURL());
  } catch {
    return "0";
  }
}

function compute(): string {
  const n = navigator as Navigator & { deviceMemory?: number; platform?: string };
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages || []).join(","),
    n.platform || "",
    String(n.hardwareConcurrency ?? ""),
    String(n.deviceMemory ?? ""),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    canvasHash(),
  ];
  return `AQ-${fnv1a(parts.join("||"))}${canvasHash().slice(0, 4)}`;
}

/** Stable device fingerprint, persisted across sessions. */
export function getDeviceFingerprint(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = compute();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return compute();
  }
}
