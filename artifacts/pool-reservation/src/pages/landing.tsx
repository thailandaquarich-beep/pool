import { FC } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  Dumbbell,
  Globe,
  HeartPulse,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Waves,
} from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const asset = (path: string) => `${baseUrl}${path}`;

const getJson = (path: string) => async () => {
  const res = await fetch(`${baseUrl}/api${path}`);
  if (!res.ok) return null;
  return res.json();
};

const baht = (n: number) => `฿${Number(n || 0).toLocaleString("th-TH")}`;

type Pkg = {
  id: number;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  price: number;
  durationDays: number;
};

type Facility = {
  id: number;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
};

const services = [
  { icon: Waves, th: "สระน้ำเกลือควบคุมอุณหภูมิ", en: "Heated salt pool" },
  { icon: HeartPulse, th: "ธาราบำบัดและฟื้นฟู", en: "Aqua therapy and recovery" },
  { icon: Dumbbell, th: "ฟิตเนส คาร์ดิโอ และสตูดิโอ", en: "Fitness, cardio and studio" },
  { icon: UserRoundCheck, th: "ครูดูแลใกล้ชิดทุกวัย", en: "Coaches for every age" },
];

const audience = [
  {
    image: "/landing/kid_ztP_hq.jpg",
    th: "เด็กเริ่มว่ายน้ำอย่างมั่นใจ",
    en: "Kids learn with confidence",
    textTh: "คลาสว่ายน้ำที่ค่อย ๆ สร้างความคุ้นเคยกับน้ำ พร้อมครูที่ดูแลใกล้ชิด",
    textEn: "Swimming classes that gently build water confidence with close coaching.",
  },
  {
    image: "/landing/fearwater_maxres.jpg",
    th: "วัยทำงานฟิตและผ่อนคลาย",
    en: "Adults stay fit and relaxed",
    textTh: "ออกกำลังกายในน้ำ ฟิตเนส คาร์ดิโอ และคลาสที่เหมาะกับไลฟ์สไตล์ประจำวัน",
    textEn: "Water workouts, fitness, cardio and classes that fit daily life.",
  },
  {
    image: "/landing/eed_mD4_hq.jpg",
    th: "ผู้สูงวัยฟื้นฟูอย่างปลอดภัย",
    en: "Seniors recover safely",
    textTh: "ธาราบำบัดและการเคลื่อนไหวในน้ำที่อ่อนโยน เหมาะกับการดูแลสุขภาพระยะยาว",
    textEn: "Gentle aqua therapy and movement for long-term wellness.",
  },
];

const fallbackPackages = [
  { id: 1, name: "คอร์สเด็ก", nameEn: "Kids Course", description: "10 ครั้ง ครั้งละ 1 ชั่วโมง", descriptionEn: "10 sessions, 1 hour each", price: 4500, durationDays: 60 },
  { id: 2, name: "คอร์สผู้ใหญ่", nameEn: "Adult Course", description: "ดูแลพื้นฐานและเทคนิคให้มั่นใจขึ้น", descriptionEn: "Build technique and confidence", price: 5500, durationDays: 60 },
  { id: 3, name: "แพ็กเกจครอบครัว", nameEn: "Family Package", description: "เหมาะกับบ้านที่ดูแลสุขภาพไปพร้อมกัน", descriptionEn: "Designed for families growing healthier together", price: 9000, durationDays: 90 },
];

export const Landing: FC = () => {
  const { language, setLanguage } = useTranslation();
  const en = language === "en";
  const pick = (th: string, english?: string | null) => (en && english ? english : th);

  const { data: packages } = useQuery<Pkg[] | null>({
    queryKey: ["public", "landing", "packages"],
    queryFn: getJson("/packages/public"),
    refetchInterval: 30000,
  });

  const { data: facilities } = useQuery<Facility[] | null>({
    queryKey: ["public", "landing", "facilities"],
    queryFn: getJson("/facilities"),
    refetchInterval: 30000,
  });

  const shownPackages = packages?.length ? packages.slice(0, 3) : fallbackPackages;
  const shownFacilities = facilities?.length ? facilities.slice(0, 4) : null;

  return (
    <div className="min-h-screen bg-[#f5fbff] text-[#183a5a]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/20 bg-[#f5fbff]/90 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-3">
            <img src={asset("/aquarich-logo.png")} alt="Aqua Rich Thailand" className="h-10 w-10 rounded-full object-contain" />
            <div className="leading-tight">
              <div className="font-display text-base font-extrabold text-[#183a5a]">Aqua Rich Thailand</div>
              <div className="text-xs font-medium text-[#57718a]">{en ? "Bangbon Wellness Center" : "ศูนย์ดูแลสุขภาพครบวงจร บางบอน"}</div>
            </div>
          </a>

          <div className="hidden items-center gap-6 text-sm font-semibold text-[#31536f] md:flex">
            <a href="#services" className="hover:text-[#1098d4]">{en ? "Services" : "บริการ"}</a>
            <a href="#packages" className="hover:text-[#1098d4]">{en ? "Packages" : "แพ็กเกจ"}</a>
            <a href="#contact" className="hover:text-[#1098d4]">{en ? "Contact" : "ติดต่อ"}</a>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setLanguage(en ? "th" : "en")}>
              <Globe className="mr-1 h-4 w-4" /> {en ? "TH" : "EN"}
            </Button>
            <Link href="/login">
              <Button variant="outline" size="sm" className="hidden rounded-full border-[#d8e6f0] md:inline-flex">{en ? "Log in" : "เข้าสู่ระบบ"}</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="rounded-full bg-[#f2c200] font-bold text-[#183a5a] hover:bg-[#ffd83d] md:hidden">
                {en ? "Join" : "สมัคร"}
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="relative min-h-[92vh] overflow-hidden pt-16 text-white">
          <img src={asset("/landing/activity_hero.jpg")} alt="Aqua Rich activities" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#102f4b]/90 via-[#102f4b]/64 to-[#102f4b]/20" />
          <div className="relative mx-auto flex min-h-[calc(92vh-4rem)] max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-[#f2c200]" />
                {en ? "More than a swimming pool" : "มากกว่าสระว่ายน้ำ"}
              </div>
              <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
                {en ? "One place for your whole family's health" : "ศูนย์สุขภาพและการออกกำลังกายครบวงจรสำหรับทุกวัย"}
              </h1>
              <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/88">
                {en
                  ? "Kids learn to swim, adults stay fit, and seniors recover safely. Aqua Rich brings warm care, real facilities and easy online booking together."
                  : "เด็กเรียนว่ายน้ำ วัยทำงานออกกำลังกาย ผู้สูงวัยฟื้นฟูสุขภาพ เราดูแลครบในที่เดียว พร้อมระบบจองออนไลน์ที่ใช้งานง่าย"}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register">
                  <Button size="lg" className="h-12 rounded-full bg-[#f2c200] px-7 font-bold text-[#183a5a] hover:bg-[#ffd83d]">
                    {en ? "Become a member" : "สมัครสมาชิก"} <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="h-12 rounded-full border-white/50 bg-white/10 px-7 font-bold text-white hover:bg-white hover:text-[#183a5a]">
                    {en ? "Log in" : "เข้าสู่ระบบ"}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#1098d4]">{en ? "What we do" : "บริการของเรา"}</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold text-[#183a5a] sm:text-4xl">
                {en ? "Care that fits every member of the family" : "ดูแลทุกคนในครอบครัวได้ในที่เดียว"}
              </h2>
              <p className="mt-4 leading-7 text-[#57718a]">
                {en
                  ? "The brand is warm, practical and real. The page highlights actual place, people and services so customers immediately understand what Aqua Rich offers."
                  : "หน้าแรกนี้เน้นภาพจริง สถานที่จริง และบริการที่ลูกค้าต้องเห็นทันที เพื่อให้เข้าใจว่า Aqua Rich ไม่ใช่แค่สระว่ายน้ำ แต่เป็นศูนย์ดูแลสุขภาพครบวงจร"}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {services.map((service) => (
                <div key={service.th} className="rounded-lg border border-[#dcebf5] bg-white p-5 shadow-sm">
                  <service.icon className="h-8 w-8 text-[#1098d4]" />
                  <h3 className="mt-4 font-display text-lg font-bold text-[#183a5a]">{pick(service.th, service.en)}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#e8f4fb] py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <h2 className="font-display text-3xl font-extrabold text-[#183a5a] sm:text-4xl">{en ? "Built for every age" : "เหมาะกับทุกวัย"}</h2>
              <p className="mt-3 text-[#57718a]">{en ? "Real services for real families." : "บริการจริงสำหรับครอบครัวจริง"}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {audience.map((item) => (
                <article key={item.th} className="overflow-hidden rounded-lg bg-white shadow-sm">
                  <img src={asset(item.image)} alt={pick(item.th, item.en)} className="h-56 w-full object-cover" />
                  <div className="p-5">
                    <h3 className="font-display text-xl font-bold text-[#183a5a]">{pick(item.th, item.en)}</h3>
                    <p className="mt-2 leading-7 text-[#57718a]">{pick(item.textTh, item.textEn)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:items-center">
          <div className="grid grid-cols-2 gap-4">
            <img src={asset("/landing/tripcom_1.webp")} alt="Aqua Rich building" className="h-64 w-full rounded-lg object-cover" />
            <img src={asset("/landing/walkthrough_maxres.jpg")} alt="Aqua Rich pool" className="mt-10 h-64 w-full rounded-lg object-cover" />
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#e0218a]">{en ? "Why Aqua Rich" : "ทำไมต้อง Aqua Rich"}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold text-[#183a5a] sm:text-4xl">
              {en ? "Warm care, clear system, trusted place" : "อบอุ่น ชัดเจน และไว้ใจได้"}
            </h2>
            <div className="mt-6 space-y-4">
              {[
                en ? "Salt water facilities that are gentle and family-friendly." : "สระน้ำเกลือที่อ่อนโยนและเหมาะกับครอบครัว",
                en ? "Health-focused programs for kids, working adults and seniors." : "โปรแกรมสุขภาพสำหรับเด็ก วัยทำงาน และผู้สูงวัย",
                en ? "Online booking, membership cards and package history in one system." : "จองออนไลน์ บัตรสมาชิก และประวัติแพ็กเกจอยู่ในระบบเดียว",
              ].map((text) => (
                <div key={text} className="flex gap-3 rounded-lg border border-[#dcebf5] bg-white p-4">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#1098d4]" />
                  <span className="leading-7 text-[#31536f]">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {shownFacilities && (
          <section className="bg-[#f8fcff] py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#1098d4]">{en ? "Live facilities" : "บริการจากระบบ"}</p>
                  <h2 className="mt-2 font-display text-3xl font-extrabold text-[#183a5a]">{en ? "Updated from admin data" : "ข้อมูลอัปเดตจากแอดมิน"}</h2>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                {shownFacilities.map((item) => (
                  <article key={item.id} className="rounded-lg border border-[#dcebf5] bg-white p-4 shadow-sm">
                    {item.imageUrl ? <img src={item.imageUrl} alt={pick(item.name, item.nameEn)} className="mb-4 h-32 w-full rounded-md object-cover" /> : null}
                    <h3 className="font-bold text-[#183a5a]">{pick(item.name, item.nameEn)}</h3>
                    {(item.description || item.descriptionEn) && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#57718a]">{pick(item.description || "", item.descriptionEn)}</p>}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="packages" className="bg-[#183a5a] py-16 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#f2c200]">{en ? "Packages" : "แพ็กเกจสมาชิก"}</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">{en ? "Choose what fits your family" : "เลือกแพ็กเกจที่เหมาะกับครอบครัวคุณ"}</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {shownPackages.map((pkg, index) => (
                <article key={pkg.id} className={`rounded-lg border p-6 ${index === 1 ? "border-[#f2c200] bg-white text-[#183a5a]" : "border-white/18 bg-white/8"}`}>
                  {index === 1 && <div className="mb-4 inline-flex rounded-full bg-[#f2c200] px-3 py-1 text-xs font-extrabold text-[#183a5a]">{en ? "Recommended" : "แนะนำ"}</div>}
                  <h3 className="font-display text-xl font-extrabold">{pick(pkg.name, pkg.nameEn)}</h3>
                  <div className={`mt-3 font-display text-3xl font-extrabold ${index === 1 ? "text-[#1098d4]" : "text-[#f2c200]"}`}>{baht(pkg.price)}</div>
                  <p className={`mt-3 leading-7 ${index === 1 ? "text-[#57718a]" : "text-white/75"}`}>{pick(pkg.description || `${pkg.durationDays} วัน`, pkg.descriptionEn)}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Link href="/register">
                <Button size="lg" className="rounded-full bg-[#f2c200] px-8 font-bold text-[#183a5a] hover:bg-[#ffd83d]">
                  {en ? "Start membership" : "เริ่มสมัครสมาชิก"}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section id="contact" className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#1098d4]">{en ? "Visit us" : "มาหาเรา"}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold text-[#183a5a] sm:text-4xl">{en ? "Aqua Rich Thailand, Bangbon" : "Aqua Rich Thailand บางบอน"}</h2>
            <div className="mt-6 space-y-4 text-[#31536f]">
              <p className="flex gap-3"><MapPin className="mt-1 h-5 w-5 shrink-0 text-[#1098d4]" /> บางบอน 5 ซอย 18 (เพชรเกษม 81)</p>
              <p className="flex gap-3"><Clock className="mt-1 h-5 w-5 shrink-0 text-[#1098d4]" /> {en ? "Tue-Sun 9:00-19:00, closed Monday" : "อังคาร-อาทิตย์ 9:00-19:00 ปิดวันจันทร์"}</p>
              <p className="flex gap-3"><Phone className="mt-1 h-5 w-5 shrink-0 text-[#1098d4]" /> 094-978-2542 · LINE @mjc3249s</p>
              <p className="flex gap-3"><CalendarCheck className="mt-1 h-5 w-5 shrink-0 text-[#1098d4]" /> {en ? "Book online through the member system." : "จองออนไลน์ผ่านระบบสมาชิกได้ทันที"}</p>
            </div>
          </div>
          <iframe
            title="Aqua Rich Thailand map"
            loading="lazy"
            className="h-[360px] w-full rounded-lg border border-[#dcebf5]"
            src="https://maps.google.com/maps?q=Aquarich%20Thailand%20Bangbon%205&output=embed"
          />
        </section>

        <section className="bg-[#1098d4] px-4 py-14 text-center text-white sm:px-6 lg:px-8">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#f2c200]" />
          <h2 className="mx-auto mt-4 max-w-3xl font-display text-3xl font-extrabold sm:text-4xl">
            {en ? "Ready to care for your whole family?" : "พร้อมเริ่มดูแลสุขภาพทั้งบ้านหรือยัง?"}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-white/88">{en ? "Create an account and start booking from the same system." : "สมัครสมาชิกแล้วเริ่มจองคลาสผ่านระบบเดียวกันได้เลย"}</p>
          <div className="mt-7">
            <Link href="/register">
              <Button size="lg" className="rounded-full bg-white px-8 font-bold text-[#1098d4] hover:bg-[#eef8ff]">
                {en ? "Create account" : "สมัครสมาชิก"} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-[#183a5a] px-4 py-8 text-center text-sm text-white/70">
        © 2026 Aqua Rich Thailand · Bangbon · 094-978-2542 · LINE @mjc3249s
      </footer>
    </div>
  );
};
