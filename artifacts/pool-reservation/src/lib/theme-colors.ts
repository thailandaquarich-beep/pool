// Derive the app's accent/brand CSS variables from a single base color {h,s,l}
// and apply them inline on <html> (overrides the stylesheet :root for light AND dark).

export type ThemeColor = { h: number; s: number; l: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hsl = (h: number, s: number, l: number) => `${((Math.round(h) % 360) + 360) % 360} ${clamp(Math.round(s), 0, 100)}% ${clamp(Math.round(l), 0, 100)}%`;

// Every var we override — kept in one place so clearing is exact.
const VARS = [
  "--primary", "--ring", "--sidebar-primary", "--sidebar-ring",
  "--accent", "--accent-foreground", "--sidebar-accent", "--sidebar-accent-foreground",
  "--brand-from", "--brand-via", "--brand-to", "--glow",
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
] as const;

export function deriveThemeVars({ h, s, l }: ThemeColor): Record<string, string> {
  const S = clamp(s, 35, 100);
  return {
    "--primary": hsl(h, S, l),
    "--ring": hsl(h, S, l + 2),
    "--sidebar-primary": hsl(h, S, l),
    "--sidebar-ring": hsl(h, S, l + 2),
    "--accent": hsl(h, Math.min(S, 70), 93),
    "--accent-foreground": hsl(h, 80, 24),
    "--sidebar-accent": hsl(h, Math.min(S, 70), 94),
    "--sidebar-accent-foreground": hsl(h, 80, 24),
    "--brand-from": hsl(h + 18, Math.max(S, 80), Math.min(l + 16, 66)),
    "--brand-via": hsl(h, Math.max(S, 85), l),
    "--brand-to": hsl(h - 28, Math.max(S, 70), Math.max(l - 5, 38)),
    "--glow": hsl(h, Math.max(S, 85), l),
    "--chart-1": hsl(h + 18, 85, 52),
    "--chart-2": hsl(h, 85, 47),
    "--chart-3": hsl(h - 28, 78, 44),
    "--chart-4": hsl(h - 50, 64, 46),
    "--chart-5": hsl(h + 30, 85, 60),
  };
}

export function applyThemeColor(color: ThemeColor | null) {
  const root = document.documentElement;
  if (!color) {
    for (const v of VARS) root.style.removeProperty(v);
    return;
  }
  const vars = deriveThemeVars(color);
  for (const [k, val] of Object.entries(vars)) root.style.setProperty(k, val);
}
