import { FC, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  X, Sparkles, ArrowRight, CalendarCheck, Waves, HeartPulse, Globe,
} from "lucide-react";

/* localStorage flag — set when the visitor ticks "don't show again". */
const HIDE_KEY = "aquarich_landing_popup_hidden";
const SEEN_KEY = "aquarich_landing_popup_seen";
/* routes where the welcome popup would get in the way (auth forms) */
const SUPPRESS_ON = ["/login", "/register"];

/**
 * Aquarich welcome popup — greets visitors on app open with the brand pitch and
 * the three primary actions (book / sign up / sign in). Copy comes from i18n, all
 * colour/motion from the app theme. Dismissable, with an opt-out persisted to
 * localStorage. See dev structure doc: components/LandingPopup.tsx.
 */
export const LandingPopup: FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  // Decide whether to greet — once auth state is known, on a non-auth route,
  // and only if the visitor hasn't opted out. Small delay lets the app settle.
  useEffect(() => {
    if (isLoading) return;
    if (localStorage.getItem(HIDE_KEY) === "1" || localStorage.getItem(SEEN_KEY) === "1") return;
    if (SUPPRESS_ON.some((p) => location.startsWith(p))) return;
    const id = window.setTimeout(() => {
      localStorage.setItem(SEEN_KEY, "1");
      setOpen(true);
    }, 550);
    return () => window.clearTimeout(id);
  }, [isLoading, location]);

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    if (dontShow) localStorage.setItem(HIDE_KEY, "1");
    setOpen(false);
  };

  const go = (path: string) => {
    if (dontShow) localStorage.setItem(HIDE_KEY, "1");
    setOpen(false);
    setLocation(path);
  };

  if (!open) return null;

  const features = [
    { icon: CalendarCheck, label: t("popup.feat1") },
    { icon: Waves, label: t("popup.feat2") },
    { icon: HeartPulse, label: t("popup.feat3") },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/55 backdrop-blur-sm animate-page"
        onClick={close}
        aria-hidden
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("popup.welcome")}
        className="relative z-10 box-border min-w-0 w-[calc(100vw-1.5rem)] max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-x-hidden overflow-y-auto rounded-3xl glass shadow-2xl shadow-primary/20 animate-rise"
      >
        {/* ===== Brand header band ===== */}
        <div className="relative bg-brand-rich bg-brand-animated sheen px-6 pt-6 pb-7 text-white">
          {/* warm (yellow) glow accent — the new brand warmth */}
          <div className="pointer-events-none absolute -top-8 -right-6 w-36 h-36 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-8 w-32 h-32 rounded-full bg-white/15 blur-3xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/90 text-amber-950 text-xs font-bold px-2.5 py-1 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" /> {t("popup.badge")}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLanguage(language === "th" ? "en" : "th")}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-white/15 transition-colors"
                aria-label="Toggle language"
              >
                <Globe className="w-3.5 h-3.5" /> {language === "th" ? "EN" : "ไทย"}
              </button>
              <button
                onClick={close}
                className="rounded-full p-1.5 text-white/80 hover:text-white hover:bg-white/15 transition-colors"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative mt-4 flex items-center gap-3.5">
            <div className="bg-white/15 ring-1 ring-amber-200/40 rounded-2xl p-2.5 shadow-inner shrink-0">
              <img src="/aquarich-logo.png" alt="Aquarich" className="w-12 h-12 object-contain drop-shadow" draggable={false} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-display font-extrabold leading-tight drop-shadow-sm">{t("popup.welcome")}</h2>
              <p className="text-white/85 text-sm mt-0.5">{t("popup.tagline")}</p>
            </div>
          </div>
        </div>

        {/* ===== Body ===== */}
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground leading-relaxed text-center">{t("popup.subtitle")}</p>

          {/* feature chips */}
          <div className="mt-4 grid min-w-0 grid-cols-3 gap-2">
            {features.map((f, i) => (
              <div key={i} className="min-w-0 rounded-2xl bg-brand-soft ring-1 ring-primary/10 px-1.5 sm:px-2 py-3 text-center">
                <div className="w-9 h-9 mx-auto rounded-xl icon-tile bg-brand flex items-center justify-center mb-1.5">
                  <f.icon className="w-4.5 h-4.5" />
                </div>
                <div className="break-words text-[11px] leading-tight font-medium text-foreground/80">{f.label}</div>
              </div>
            ))}
          </div>

          {/* ===== CTAs ===== */}
          <div className="mt-5 space-y-2.5">
            <Button
              onClick={() => go("/book")}
              className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 transition-all active:scale-[.98] gap-2"
            >
              {t("popup.cta.book")} <ArrowRight className="w-5 h-5" />
            </Button>

            {!isAuthenticated && (
              <div className="grid min-w-0 grid-cols-2 gap-2.5">
                <Button onClick={() => go("/register")} variant="outline" className="min-w-0 h-11 rounded-xl font-semibold border-primary/25 hover:bg-primary/5">
                  {t("popup.cta.register")}
                </Button>
                <Button onClick={() => go("/login")} variant="ghost" className="min-w-0 h-11 rounded-xl font-semibold hover:bg-primary/5">
                  {t("popup.cta.login")}
                </Button>
              </div>
            )}
          </div>

          {/* ===== Don't show again ===== */}
          <label className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} className="h-4 w-4" />
            {t("popup.dontShow")}
          </label>
        </div>
      </div>
    </div>
  );
};
