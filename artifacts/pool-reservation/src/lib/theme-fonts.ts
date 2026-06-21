// Curated, Thai-supporting font themes (all on Google Fonts). The active one is loaded
// on demand and applied via --app-font-sans / --app-font-display (used by body + headings).

export type FontDef = {
  key: string;
  label: string;       // shown in the picker
  note: string;        // short vibe description
  sans: string;        // body font-family stack
  display: string;     // heading font-family stack
  families: string[];  // css2 "Family:wght@..." specs to load (empty = built-in)
};

export const FONTS: FontDef[] = [
  { key: "default", label: "ค่าเริ่มต้น", note: "Inter / Sora — โมเดิร์น", sans: "'Inter', sans-serif", display: "'Sora','Inter',sans-serif", families: [] },
  { key: "kanit", label: "Kanit", note: "โมเดิร์นพรีเมียม สไตล์แบรนด์ไทย", sans: "'Kanit', sans-serif", display: "'Kanit', sans-serif", families: ["Kanit:wght@300;400;500;600;700;800"] },
  { key: "prompt", label: "Prompt", note: "เรขาคณิต สะอาดตา ทางการ", sans: "'Prompt', sans-serif", display: "'Prompt', sans-serif", families: ["Prompt:wght@300;400;500;600;700"] },
  { key: "sarabun", label: "Sarabun", note: "ทางการ อ่านง่าย (ฟอนต์ราชการ)", sans: "'Sarabun', sans-serif", display: "'Sarabun', sans-serif", families: ["Sarabun:wght@300;400;500;600;700"] },
  { key: "ibm", label: "IBM Plex", note: "คอร์ปอเรต มืออาชีพ", sans: "'IBM Plex Sans Thai', sans-serif", display: "'IBM Plex Sans Thai', sans-serif", families: ["IBM+Plex+Sans+Thai:wght@300;400;500;600;700"] },
  { key: "mitr", label: "Mitr", note: "เป็นมิตร ทันสมัย", sans: "'Mitr', sans-serif", display: "'Mitr', sans-serif", families: ["Mitr:wght@300;400;500;600;700"] },
  { key: "trirong", label: "Trirong", note: "หรูหรา เซริฟแบบแฟชั่น", sans: "'Sarabun', sans-serif", display: "'Trirong', serif", families: ["Trirong:wght@500;600;700", "Sarabun:wght@300;400;500;600;700"] },
  { key: "notoserif", label: "Noto Serif Thai", note: "คลาสสิก เรียบหรู", sans: "'Noto Serif Thai', serif", display: "'Noto Serif Thai', serif", families: ["Noto+Serif+Thai:wght@400;500;600;700"] },
  { key: "chonburi", label: "Chonburi", note: "ดิสเพลย์เด่น สไตล์โลโก้แบรนด์", sans: "'Sarabun', sans-serif", display: "'Chonburi', serif", families: ["Chonburi", "Sarabun:wght@300;400;500;600;700"] },
];

export const FONT_MAP: Record<string, FontDef> = Object.fromEntries(FONTS.map((f) => [f.key, f]));

const href = (families: string[]) =>
  families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => "family=" + f).join("&")}&display=swap` : null;

/** Combined link for previewing every option (used only on the admin theme page). */
export function previewFontsHref() {
  const all = [...new Set(FONTS.flatMap((f) => f.families))];
  return href(all);
}

/** Apply the chosen font site-wide: load it (once) and point the CSS vars at it. */
export function applyThemeFont(key: string | null | undefined) {
  const root = document.documentElement;
  const def = key ? FONT_MAP[key] : null;
  if (!def || def.key === "default" || def.families.length === 0) {
    document.getElementById("theme-font-link")?.remove();
    root.style.removeProperty("--app-font-sans");
    root.style.removeProperty("--app-font-display");
    return;
  }
  let link = document.getElementById("theme-font-link") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "theme-font-link";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  const url = href(def.families)!;
  if (link.getAttribute("href") !== url) link.setAttribute("href", url);
  root.style.setProperty("--app-font-sans", def.sans);
  root.style.setProperty("--app-font-display", def.display);
}
