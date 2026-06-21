import { FC, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import {
  Sparkles, ArrowRight, Globe, Check, Waves, Users, CalendarCheck,
  GraduationCap, Award, Crown, Clock, MapPin, Layers, ShoppingBag,
  Megaphone, Pin, ShieldCheck, HeartPulse,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   Aquarich landing — every section below is driven by LIVE data pulled from the
   public API (no auth). React Query polls on an interval and on window-focus, so
   whenever an admin edits facilities / packages / instructors / products /
   announcements in the admin panel, this page reflects it automatically.
   Public endpoints: /stats/public · /facilities · /packages/public ·
   /instructors/public · /products · /announcements
   ────────────────────────────────────────────────────────────────────────── */

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Public GET helper — returns parsed JSON, or null on any failure (sections then hide). */
const getJson = (path: string) => async () => {
  const res = await fetch(`${baseUrl}/api${path}`);
  if (!res.ok) return null;
  return res.json();
};

const baht = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

/* ---------- types (only the fields the landing renders) ---------- */
type Stats = { members: number; instructors: number; facilities: number; packages: number; reservations: number };
type Facility = { id: number; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; capacity: number; openTime: string; closeTime: string; imageUrl: string | null; price: number | null; lanes: number | null; depth: string | null; location: string | null };
type Pkg = { id: number; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; price: number; durationDays: number; benefits: string | null; benefitsEn: string | null; maxBookingsPerMonth: number | null; bookingDiscount: number };
type Instructor = { id: number; firstName: string; lastName: string; specialty: string; certification: string | null; experience: string | null; biography: string | null; profileImageUrl: string | null };
type Product = { id: number; name: string; nameEn: string | null; category: string | null; description: string | null; price: number; imageUrl: string | null; stock: number | null };
type Announcement = { id: number; title: string; titleEn: string | null; content: string; contentEn: string | null; isPinned: boolean; createdAt: string };

/* ═══════════════════════════════ Shared bits ═══════════════════════════════ */

const SectionHeading: FC<{ icon: any; title: string; sub?: string }> = ({ icon: Icon, title, sub }) => (
  <div className="text-center max-w-2xl mx-auto">
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl icon-tile bg-gold mb-3">
      <Icon className="w-6 h-6" />
    </div>
    <h2 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight">
      <span className="text-gradient">{title}</span>
    </h2>
    {sub && <p className="mt-3 text-muted-foreground">{sub}</p>}
    <div className="divider-gold mx-auto mt-5" />
  </div>
);

/* ═══════════════════════════ Live data sections ════════════════════════════ */

const FacilitiesSection: FC = () => {
  const { language } = useTranslation();
  const { data } = useQuery<Facility[] | null>({ queryKey: ["public", "facilities"], queryFn: getJson("/facilities"), refetchInterval: 20000 });
  const pick = (th: string, en: string | null) => (language === "en" && en ? en : th);
  if (!data || data.length === 0) return null;
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <SectionHeading icon={Waves} title={language === "en" ? "Our Facilities" : "สิ่งอำนวยความสะดวก"} sub={language === "en" ? "Modern, well-maintained pools and amenities." : "สระว่ายน้ำมาตรฐานและสิ่งอำนวยความสะดวกที่ได้รับการดูแลอย่างดี"} />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.map((f, i) => (
          <div key={f.id} className="group rounded-2xl glass card-lift overflow-hidden animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="relative h-40 bg-brand bg-brand-animated overflow-hidden">
              {f.imageUrl
                ? <img src={f.imageUrl} alt={pick(f.name, f.nameEn)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                : <div className="w-full h-full flex items-center justify-center"><Waves className="w-12 h-12 text-white/80" /></div>}
              {f.price != null && f.price > 0 && (
                <span className="absolute top-3 right-3 rounded-full bg-gold text-xs font-bold px-2.5 py-1 shadow">{baht(f.price)}</span>
              )}
            </div>
            <div className="p-5">
              <h3 className="font-display font-bold text-lg">{pick(f.name, f.nameEn)}</h3>
              {(f.description || f.descriptionEn) && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{pick(f.description || "", f.descriptionEn)}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gold" /> {f.openTime}–{f.closeTime}</span>
                <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gold" /> {f.capacity} {language === "en" ? "people" : "คน"}</span>
                {f.lanes ? <span className="inline-flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-gold" /> {f.lanes} {language === "en" ? "lanes" : "เลน"}</span> : null}
                {f.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gold" /> {f.location}</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const PackagesSection: FC = () => {
  const { language } = useTranslation();
  const { data } = useQuery<Pkg[] | null>({ queryKey: ["public", "packages"], queryFn: getJson("/packages/public"), refetchInterval: 20000 });
  const pick = (th: string, en: string | null) => (language === "en" && en ? en : th);
  if (!data || data.length === 0) return null;
  // The middle package gets the "recommended" gold treatment.
  const featured = Math.min(1, data.length - 1);
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <SectionHeading icon={Crown} title={language === "en" ? "Membership Packages" : "แพ็กเกจสมาชิก"} sub={language === "en" ? "Flexible plans designed around your wellness goals." : "แพ็กเกจที่ออกแบบมาเพื่อเป้าหมายสุขภาพของคุณ"} />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        {data.map((p, i) => {
          const isFeatured = i === featured;
          const benefits = (pick(p.benefits || "", p.benefitsEn) || "").split(/\r?\n|·|,/).map(s => s.trim()).filter(Boolean).slice(0, 4);
          return (
            <div
              key={p.id}
              className={`relative rounded-2xl card-lift p-6 animate-rise flex flex-col ${isFeatured ? "bg-brand-rich bg-brand-animated sheen text-white ring-1 ring-[hsl(var(--gold)/0.45)] shadow-2xl shadow-primary/30" : "glass"}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {isFeatured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gold text-xs font-bold px-3 py-1 shadow-lg glow-gold">
                  <Sparkles className="w-3.5 h-3.5" /> {language === "en" ? "Recommended" : "แนะนำ"}
                </span>
              )}
              <h3 className={`font-display font-bold text-xl ${isFeatured ? "" : ""}`}>{pick(p.name, p.nameEn)}</h3>
              <div className="mt-2 flex items-end gap-1">
                <span className={`text-3xl font-display font-extrabold ${isFeatured ? "text-white" : "text-gradient-gold"}`}>{baht(p.price)}</span>
                <span className={`text-sm mb-1 ${isFeatured ? "text-white/75" : "text-muted-foreground"}`}>/ {p.durationDays} {language === "en" ? "days" : "วัน"}</span>
              </div>
              {(p.description || p.descriptionEn) && (
                <p className={`mt-2 text-sm ${isFeatured ? "text-white/85" : "text-muted-foreground"}`}>{pick(p.description || "", p.descriptionEn)}</p>
              )}
              <ul className="mt-4 space-y-2 flex-1">
                {p.maxBookingsPerMonth != null && (
                  <li className="flex items-center gap-2 text-sm"><Check className={`w-4 h-4 shrink-0 ${isFeatured ? "text-[hsl(var(--gold-soft))]" : "text-gold"}`} /> {language === "en" ? `Up to ${p.maxBookingsPerMonth} bookings / month` : `จองได้สูงสุด ${p.maxBookingsPerMonth} ครั้ง/เดือน`}</li>
                )}
                {p.bookingDiscount > 0 && (
                  <li className="flex items-center gap-2 text-sm"><Check className={`w-4 h-4 shrink-0 ${isFeatured ? "text-[hsl(var(--gold-soft))]" : "text-gold"}`} /> {language === "en" ? `${p.bookingDiscount}% booking discount` : `ส่วนลดการจอง ${p.bookingDiscount}%`}</li>
                )}
                {benefits.map((b, bi) => (
                  <li key={bi} className="flex items-center gap-2 text-sm"><Check className={`w-4 h-4 shrink-0 ${isFeatured ? "text-[hsl(var(--gold-soft))]" : "text-gold"}`} /> {b}</li>
                ))}
              </ul>
              <Link href="/register" className="mt-5">
                <Button className={`w-full h-11 rounded-xl font-semibold ${isFeatured ? "bg-white text-primary hover:bg-white/90" : "bg-gradient-to-r from-primary to-cyan-500 text-white shadow-lg shadow-primary/25"}`}>
                  {language === "en" ? "Get this plan" : "เลือกแพ็กเกจนี้"}
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const InstructorsSection: FC = () => {
  const { language } = useTranslation();
  const { data } = useQuery<Instructor[] | null>({ queryKey: ["public", "instructors"], queryFn: getJson("/instructors/public"), refetchInterval: 30000 });
  if (!data || data.length === 0) return null;
  const initials = (i: Instructor) => `${i.firstName?.trim()?.[0] || ""}${i.lastName?.trim()?.[0] || ""}`.toUpperCase();
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <SectionHeading icon={GraduationCap} title={language === "en" ? "Our Professional Instructors" : "ทีมครูฝึกผู้เชี่ยวชาญ"} sub={language === "en" ? "Certified coaches dedicated to your progress." : "ครูฝึกมืออาชีพที่พร้อมดูแลคุณอย่างใกล้ชิด"} />
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {data.map((ins, i) => (
          <div key={ins.id} className="rounded-2xl glass card-lift p-5 text-center animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="relative w-20 h-20 mx-auto">
              {ins.profileImageUrl
                ? <img src={ins.profileImageUrl} alt={ins.firstName} className="w-20 h-20 rounded-2xl object-cover ring-1 ring-[hsl(var(--gold)/0.4)]" />
                : <div className="w-20 h-20 rounded-2xl icon-tile bg-brand flex items-center justify-center text-xl font-display font-bold ring-1 ring-[hsl(var(--gold)/0.4)]">{initials(ins) || <Users className="w-8 h-8" />}</div>}
              <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-gold flex items-center justify-center shadow glow-gold"><Award className="w-4 h-4" /></span>
            </div>
            <h3 className="mt-3 font-display font-bold leading-tight">{ins.firstName} {ins.lastName}</h3>
            <p className="text-xs text-gold font-medium mt-0.5">{ins.specialty}</p>
            {ins.experience ? <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ins.experience}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
};

const ProductsSection: FC = () => {
  const { language } = useTranslation();
  const { data } = useQuery<Product[] | null>({ queryKey: ["public", "products"], queryFn: getJson("/products"), refetchInterval: 20000 });
  const pick = (th: string, en: string | null) => (language === "en" && en ? en : th);
  if (!data || data.length === 0) return null;
  const items = data.slice(0, 8);
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <SectionHeading icon={ShoppingBag} title={language === "en" ? "Products & Services" : "สินค้าและบริการ"} sub={language === "en" ? "Quality gear and add-ons for every swimmer." : "อุปกรณ์และบริการคุณภาพสำหรับทุกการว่ายน้ำ"} />
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {items.map((p, i) => (
          <div key={p.id} className="group rounded-2xl glass card-lift overflow-hidden animate-rise" style={{ animationDelay: `${i * 55}ms` }}>
            <div className="relative h-32 bg-brand-soft overflow-hidden flex items-center justify-center">
              {p.imageUrl
                ? <img src={p.imageUrl} alt={pick(p.name, p.nameEn)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                : <ShoppingBag className="w-9 h-9 text-primary/40" />}
              {p.category ? <span className="absolute top-2 left-2 rounded-full bg-gold-soft text-[10px] font-semibold text-[hsl(var(--gold-deep))] px-2 py-0.5">{p.category}</span> : null}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-sm leading-tight line-clamp-1">{pick(p.name, p.nameEn)}</h3>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-display font-bold text-gradient-gold">{baht(p.price)}</span>
                {p.stock != null && p.stock <= 5 && <span className="text-[10px] text-amber-600 font-medium">{language === "en" ? `${p.stock} left` : `เหลือ ${p.stock}`}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const AnnouncementsSection: FC = () => {
  const { language } = useTranslation();
  const { data } = useQuery<Announcement[] | null>({ queryKey: ["public", "announcements"], queryFn: getJson("/announcements"), refetchInterval: 20000 });
  const pick = (th: string, en: string | null) => (language === "en" && en ? en : th);
  if (!data || data.length === 0) return null;
  const items = data.slice(0, 4);
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
      <SectionHeading icon={Megaphone} title={language === "en" ? "News & Announcements" : "ข่าวสารและประกาศ"} sub={language === "en" ? "Stay up to date with the latest from Aquarich." : "ติดตามข่าวสารและกิจกรรมล่าสุดจาก Aquarich"} />
      <div className="mt-10 grid sm:grid-cols-2 gap-5">
        {items.map((a, i) => (
          <div key={a.id} className="rounded-2xl glass card-lift p-6 animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl icon-tile bg-gold flex items-center justify-center shrink-0">
                {a.isPinned ? <Pin className="w-5 h-5" /> : <Megaphone className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold leading-tight">{pick(a.title, a.titleEn)}</h3>
                  {a.isPinned && <span className="rounded-full bg-gold-soft text-[10px] font-bold text-[hsl(var(--gold-deep))] px-2 py-0.5">{language === "en" ? "Pinned" : "ปักหมุด"}</span>}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-3">{pick(a.content, a.contentEn)}</p>
                <p className="mt-2 text-xs text-muted-foreground/70">{new Date(a.createdAt).toLocaleDateString(language === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

/* ═══════════════════════════════ Page ═══════════════════════════════ */

export const Landing: FC = () => {
  const { language, setLanguage } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  // Live hero counts — non-sensitive aggregates, refreshed on an interval.
  const { data: stats } = useQuery<Stats | null>({ queryKey: ["public", "stats"], queryFn: getJson("/stats/public"), refetchInterval: 20000 });

  // Pointer parallax (desktop / fine-pointer only) — feeds --px/--py to decorative layers.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const el = rootRef.current;
    if (!el) return;
    let raf = 0, x = 0, y = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const en = language === "en";
  const heroStats = [
    { icon: Users, v: stats?.members, label: en ? "Members" : "สมาชิก" },
    { icon: GraduationCap, v: stats?.instructors, label: en ? "Instructors" : "ครูฝึก" },
    { icon: Waves, v: stats?.facilities, label: en ? "Facilities" : "สิ่งอำนวยความสะดวก" },
    { icon: CalendarCheck, v: stats?.reservations, label: en ? "Bookings" : "การจองสะสม" },
  ];
  const bullets = en
    ? ["No joining fee", "Cancel anytime", "Thai language ready"]
    : ["ไม่มีค่าแรกเข้า", "ยกเลิกได้ทุกเมื่อ", "รองรับภาษาไทย"];

  return (
    <div ref={rootRef} className="min-h-screen w-full bg-aurora bg-aurora-animated relative overflow-hidden">
      {/* ===== Parallax decorative blobs ===== */}
      <div className="pointer-events-none absolute -top-28 -left-24 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * 44px), calc(var(--py,0) * 44px), 0)" }}>
        <div className="w-[28rem] h-[28rem] rounded-full bg-brand-from/25 blur-3xl animate-float" />
      </div>
      <div className="pointer-events-none absolute top-1/4 -right-24 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * -36px), calc(var(--py,0) * -26px), 0)" }}>
        <div className="w-[24rem] h-[24rem] rounded-full bg-brand-to/20 blur-3xl animate-float-slow" />
      </div>
      {/* warm gold glow — the accent that ties the palette together */}
      <div className="pointer-events-none absolute top-1/2 right-1/4 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * -24px), calc(var(--py,0) * 30px), 0)" }}>
        <div className="w-72 h-72 rounded-full bg-[hsl(var(--gold)/0.18)] blur-3xl animate-float-slow" />
      </div>

      {/* ===== Sticky nav ===== */}
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="mt-3 flex items-center justify-between gap-3 rounded-2xl glass px-3 sm:px-4 py-2.5 shadow-lg shadow-primary/5">
            <BrandMark size="sm" tagline />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => setLanguage(en ? "th" : "en")}>
                <Globe className="w-4 h-4" /> {en ? "ไทย" : "EN"}
              </Button>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="rounded-full hidden sm:inline-flex">{en ? "Sign in" : "เข้าสู่ระบบ"}</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="rounded-full bg-gradient-to-r from-primary to-cyan-500 shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/40 transition-all">
                  {en ? "Sign up" : "สมัครสมาชิก"}
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-8 items-center">
          {/* Copy column */}
          <div className="text-center lg:text-left animate-rise">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold-soft ring-1 ring-[hsl(var(--gold)/0.35)] px-3.5 py-1.5 text-sm font-semibold text-[hsl(var(--gold-deep))]">
              <Sparkles className="w-4 h-4 text-gold" /> {en ? "Complete aquatic wellness center" : "ศูนย์ดูแลสุขภาพและกีฬาทางน้ำครบวงจร"}
            </div>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold tracking-tight leading-[1.08]">
              <span className="text-gradient-shine">Aquarich</span>
              <br />
              <span className="text-foreground">{en ? "complete wellness center" : "ศูนย์ดูแลสุขภาพครบวงจร"}</span>
            </h1>
            <div className="divider-gold mt-5 mx-auto lg:mx-0" />
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
              {en
                ? "Standard swimming pools, expert instructors and membership plans built around your health — backed by a modern booking and management system."
                : "บริการสระว่ายน้ำมาตรฐาน ครูฝึกผู้เชี่ยวชาญ และแพ็กเกจสมาชิกที่ออกแบบเพื่อสุขภาพที่ดีของคุณ พร้อมระบบจองและจัดการที่ทันสมัย"}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto h-12 px-7 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 transition-all active:scale-[.98] gap-2">
                  {en ? "Get started free" : "เริ่มใช้งานฟรี"} <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-7 rounded-xl text-base font-semibold glass border-primary/20 hover:bg-primary/5 transition-all">
                  {en ? "Sign in" : "เข้าสู่ระบบ"}
                </Button>
              </Link>
            </div>

            {/* live stats */}
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto lg:mx-0">
              {heroStats.map((s, i) => (
                <div key={i} className="rounded-2xl glass px-3 py-3 text-center">
                  <s.icon className="w-5 h-5 mx-auto text-gold mb-1" />
                  <div className="text-xl font-display font-bold text-gradient-gold tabular-nums">{s.v != null ? s.v.toLocaleString() : "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual column */}
          <div className="relative animate-rise" style={{ animationDelay: "120ms" }}>
            <div
              className="relative rounded-[2rem] overflow-hidden bg-brand bg-brand-animated sheen ring-1 ring-[hsl(var(--gold)/0.35)] shadow-2xl shadow-primary/30 aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5]"
              style={{ transform: "translate3d(calc(var(--px,0) * -16px), calc(var(--py,0) * -16px), 0)" }}
            >
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?q=80&w=1600&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-overlay" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/10" />
              <div className="absolute inset-0 flex flex-col justify-end p-7 text-white">
                <Waves className="w-10 h-10 mb-3 drop-shadow-lg" />
                <div className="text-2xl font-display font-extrabold drop-shadow-lg">Aquarich</div>
                <div className="text-white/85 mt-1">{en ? "Complete wellness center" : "ศูนย์ดูแลสุขภาพครบวงจร"}</div>
              </div>
            </div>

            {/* floating glass badges */}
            <div className="absolute -left-3 sm:-left-6 top-10 rounded-2xl glass px-3.5 py-2.5 shadow-xl animate-float will-change-transform">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl icon-tile bg-brand flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
                <div className="text-sm font-semibold leading-tight">{en ? "Safe & certified" : "ปลอดภัย ได้มาตรฐาน"}</div>
              </div>
            </div>
            <div className="absolute -right-2 sm:-right-5 bottom-12 rounded-2xl glass px-3.5 py-2.5 shadow-xl animate-float-slow will-change-transform">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl icon-tile bg-gold flex items-center justify-center"><HeartPulse className="w-5 h-5" /></div>
                <div className="text-sm font-semibold leading-tight">{en ? "Wellness first" : "ใส่ใจสุขภาพ"}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Live data sections (auto-refresh from the admin panel) ===== */}
      <FacilitiesSection />
      <PackagesSection />
      <InstructorsSection />
      <ProductsSection />
      <AnnouncementsSection />

      {/* ===== Final CTA ===== */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="relative rounded-[2rem] overflow-hidden bg-brand-rich bg-brand-animated sheen ring-1 ring-[hsl(var(--gold)/0.35)] shadow-2xl shadow-primary/30 px-6 sm:px-12 py-12 sm:py-16 text-center text-white">
          <div className="pointer-events-none absolute -top-12 -right-10 w-52 h-52 rounded-full bg-[hsl(var(--gold)/0.45)] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-10 w-44 h-44 rounded-full bg-[hsl(var(--gold-soft)/0.30)] blur-3xl" />
          <h2 className="text-3xl sm:text-4xl font-display font-extrabold drop-shadow-lg">{en ? "Ready to dive in?" : "พร้อมเริ่มดูแลสุขภาพแล้วหรือยัง?"}</h2>
          <p className="mt-3 text-white/90 text-lg max-w-xl mx-auto">{en ? "Sign up today and start booking right away." : "สมัครสมาชิกวันนี้ แล้วเริ่มจองบริการได้ทันที"}</p>
          <div className="mt-7 flex justify-center">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 rounded-xl text-base font-semibold bg-white text-primary hover:bg-white/90 shadow-xl transition-all active:scale-[.98] gap-2">
                {en ? "Create a free account" : "สมัครสมาชิกฟรี"} <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/85">
            {bullets.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-[hsl(var(--gold-soft))]" /> {b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandMark size="sm" tagline />
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-primary transition-colors">{en ? "Sign in" : "เข้าสู่ระบบ"}</Link>
            <Link href="/register" className="hover:text-primary transition-colors">{en ? "Sign up" : "สมัครสมาชิก"}</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Aquarich · {en ? "Complete wellness center" : "ศูนย์ดูแลสุขภาพครบวงจร"}</p>
        </div>
      </footer>
    </div>
  );
};
