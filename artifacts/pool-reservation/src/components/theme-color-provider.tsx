import { FC, ReactNode, useEffect } from "react";
import { applyThemeColor, type ThemeColor } from "@/lib/theme-colors";
import { applyThemeFont } from "@/lib/theme-fonts";

/**
 * Applies the site-wide accent color to every client and keeps it in sync in ~realtime
 * via SSE — so when an admin saves a new color, all open sessions recolor within seconds.
 * Public endpoint, so it works on logged-out pages (login/register) too.
 */
export const ThemeColorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
    let alive = true;
    const ctrl = new AbortController();

    const apply = (d: { color?: ThemeColor | null; font?: string | null }) => {
      if (!alive) return;
      applyThemeColor(d.color ?? null);
      applyThemeFont(d.font ?? null);
    };

    // initial fetch (fast paint)
    fetch(`${baseUrl}/api/theme`).then((r) => (r.ok ? r.json() : null)).then((d) => d && apply(d)).catch(() => {});

    // live updates (fetch-reader SSE)
    (async () => {
      try {
        const r = await fetch(`${baseUrl}/api/theme/stream`, { signal: ctrl.signal });
        if (!r.ok || !r.body) return;
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
            if (line.startsWith("data:")) { try { apply(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ } }
          }
        }
      } catch { /* stream ended/aborted */ }
    })();

    return () => { alive = false; ctrl.abort(); };
  }, []);

  return <>{children}</>;
};
