import { FC, useRef, useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getDeviceFingerprint } from "@/lib/device-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, CalendarCheck, Wallet, QrCode, Globe, RefreshCw, MailCheck, ShieldCheck } from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

const registerSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  weight: z.string().optional(),
  height: z.string().optional(),
  phone: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  username: z.string().min(3, "Min 3 characters"),
  password: z.string().min(6, "Min 6 characters"),
  confirmPassword: z.string().min(6, "Min 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const perks = [
  { icon: CalendarCheck, text: "จองสระออนไลน์ ทุกที่ทุกเวลา" },
  { icon: Wallet, text: "กระเป๋าเงินและแพ็กเกจสมาชิกสุดคุ้ม" },
  { icon: QrCode, text: "บัตรสมาชิกดิจิทัล + เช็คอินด้วย QR" },
];

export const Register: FC = () => {
  const { t, setLanguage, language } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);

  // Pointer parallax (desktop / fine-pointer only).
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
      raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty("--px", x.toFixed(3)); el.style.setProperty("--py", y.toFixed(3)); });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const th = language === "th";

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", weight: "", height: "", phone: "", email: "", username: "", password: "", confirmPassword: "" },
  });

  // Two-step flow: (1) fill form + solve captcha -> email OTP, (2) enter OTP -> create account.
  const [step, setStep] = useState<"form" | "otp">("form");
  const [captcha, setCaptcha] = useState<{ id: string; svg: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fetchCaptcha = async () => {
    setCaptchaAnswer("");
    try {
      const r = await fetch(`${baseUrl}/api/auth/captcha`);
      if (r.ok) setCaptcha(await r.json());
    } catch { /* ignore — user can refresh */ }
  };
  useEffect(() => { fetchCaptcha(); }, []);

  // Step 1 — validate the form (react-hook-form), then request an OTP email.
  const onRequestOtp = async (data: z.infer<typeof registerSchema>) => {
    setError(null); setInfo(null);
    if (!captchaAnswer.trim()) { setError(th ? "กรุณากรอกรหัสในภาพ" : "Please enter the captcha"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${baseUrl}/api/auth/register/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, username: data.username, captchaId: captcha?.id, captchaAnswer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.message || (th ? "ส่งรหัสไม่สำเร็จ" : "Failed to send code"));
        if (j.error === "captcha") fetchCaptcha();
        setBusy(false);
        return;
      }
      setPendingEmail(data.email);
      setStep("otp");
      if (j.devMode && j.devCode) { setOtpCode(j.devCode); setInfo((th ? "โหมดทดสอบ: รหัส " : "Dev mode: code ") + j.devCode); }
    } catch {
      setError(th ? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" : "Connection failed");
    }
    setBusy(false);
  };

  // Step 2 — submit the full registration with the verified OTP.
  const onVerifyRegister = async () => {
    setError(null);
    if (!/^\d{6}$/.test(otpCode)) { setError(th ? "กรุณากรอกรหัส OTP 6 หลัก" : "Enter the 6-digit code"); return; }
    const data = form.getValues();
    setBusy(true);
    try {
      const r = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName, lastName: data.lastName, weight: data.weight, height: data.height,
          phone: data.phone, email: data.email, username: data.username, password: data.password,
          otp: otpCode, deviceFingerprint: getDeviceFingerprint(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) {
        setError(j.message || j.error || (th ? "สมัครสมาชิกไม่สำเร็จ" : "Registration failed"));
        setBusy(false);
        return;
      }
      login(j.token, j.user);
      setLocation("/dashboard");
    } catch {
      setError(th ? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" : "Connection failed");
      setBusy(false);
    }
  };

  const backToForm = () => { setStep("form"); setOtpCode(""); setError(null); setInfo(null); fetchCaptcha(); };

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col md:flex-row bg-aurora bg-aurora-animated relative overflow-hidden">
      {/* ===== Desktop hero panel (left) ===== */}
      <div className="hidden md:flex md:w-[42%] lg:w-2/5 bg-brand bg-brand-animated relative overflow-hidden sheen flex-col justify-between p-10 text-white">
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1530549387789-4c1017266635?q=80&w=1974&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
        <div className="pointer-events-none absolute top-1/4 -left-16 w-64 h-64 rounded-full bg-white/10 blur-3xl will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * 40px), calc(var(--py,0) * 30px), 0)" }} />
        <div className="pointer-events-none absolute bottom-10 right-0 w-56 h-56 rounded-full bg-brand-to/30 blur-3xl will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * -34px), calc(var(--py,0) * -24px), 0)" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3" style={{ transform: "translate3d(calc(var(--px,0) * -10px), calc(var(--py,0) * -10px), 0)" }}>
          <div className="bg-white/15 ring-1 ring-white/30 rounded-2xl p-2 shadow-xl sheen">
            <img src="/aquarich-logo.png" alt="Aquarich" className="w-11 h-11 object-contain drop-shadow select-none" draggable={false} />
          </div>
          <span className="text-2xl font-display font-extrabold drop-shadow">Aquarich</span>
        </div>

        <div className="relative z-10 space-y-5">
          <h2 className="text-4xl lg:text-5xl font-display font-extrabold leading-tight drop-shadow-lg">
            เริ่มต้นว่ายน้ำ<br />ไปกับ Aquarich
          </h2>
          <p className="text-white/85 max-w-xs">สมัครสมาชิกวันนี้ จองสระได้ทุกที่ทุกเวลา พร้อมสิทธิพิเศษและแพ็กเกจสุดคุ้ม</p>
          <ul className="space-y-2.5 pt-1">
            {perks.map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/15 px-4 py-2.5 animate-rise hover:translate-x-1 transition-transform" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner"><p.icon className="w-4.5 h-4.5" /></span>
                <span className="text-sm text-white/90">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ===== Form (right) ===== */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        {/* parallax blobs (mobile + form side) */}
        <div className="pointer-events-none absolute -top-24 -right-24 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * 40px), calc(var(--py,0) * 30px), 0)" }}>
          <div className="w-96 h-96 rounded-full bg-brand-from/25 blur-3xl animate-float" />
        </div>
        <div className="pointer-events-none absolute -bottom-24 -left-20 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * -30px), calc(var(--py,0) * -22px), 0)" }}>
          <div className="w-80 h-80 rounded-full bg-brand-to/20 blur-3xl animate-float-slow" />
        </div>

        <div className="w-full max-w-xl space-y-5 relative z-10 animate-rise">
          <div className="flex items-center justify-between">
            {/* mobile logo */}
            <div className="md:hidden flex items-center gap-2.5">
              <div className="bg-brand bg-brand-animated rounded-2xl p-2 shadow-lg shadow-primary/30 ring-1 ring-white/30 sheen">
                <img src="/aquarich-logo.png" alt="Aquarich" className="w-9 h-9 object-contain" draggable={false} />
              </div>
              <span className="text-xl font-display font-extrabold text-gradient">Aquarich</span>
            </div>
            <span className="hidden md:block text-sm text-muted-foreground">มีบัญชีอยู่แล้ว? <Link href="/login" className="text-gradient font-semibold">เข้าสู่ระบบ</Link></span>
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => setLanguage(language === "th" ? "en" : "th")}>
              <Globe className="w-4 h-4" /> {language === "th" ? "EN" : "ไทย"}
            </Button>
          </div>

          <Card className="glass border-none shadow-2xl shadow-primary/10 rounded-2xl">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-display tracking-tight">{t("auth.register.title")}</CardTitle>
              <CardDescription>{t("auth.register.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onRequestOtp)} className="space-y-4">
                 {step === "form" ? (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.firstName")}</FormLabel><FormControl><Input className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.lastName")}</FormLabel><FormControl><Input className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <FormField control={form.control} name="weight" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.weight")}</FormLabel><FormControl><Input type="number" min={0} className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="height" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.height")}</FormLabel><FormControl><Input type="number" min={0} className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.phone")}</FormLabel><FormControl><Input inputMode="tel" placeholder="08X-XXX-XXXX" className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>{t("auth.email")}</FormLabel><FormControl><Input type="email" className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem><FormLabel>{t("auth.username")}</FormLabel><FormControl><Input className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.password")}</FormLabel><FormControl><Input type="password" className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.confirmPassword")}</FormLabel><FormControl><Input type="password" className="h-11 rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  {/* CAPTCHA — self-hosted human check (plain label: outside react-hook-form's FormField context) */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium leading-none">{th ? "ยืนยันว่าคุณเป็นมนุษย์" : "Verify you are human"}</label>
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-xl overflow-hidden ring-1 ring-border bg-white shrink-0 h-[60px] flex items-center" dangerouslySetInnerHTML={{ __html: captcha?.svg || "" }} />
                      <button type="button" onClick={fetchCaptcha} title={th ? "สุ่มภาพใหม่" : "New image"} className="h-11 w-11 inline-flex items-center justify-center rounded-xl border hover:bg-muted transition-colors shrink-0">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <Input value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder={th ? "กรอกอักษรในภาพ" : "Enter the text"} className="h-11 rounded-xl tracking-[0.3em] uppercase" autoComplete="off" />
                    </div>
                  </div>

                  {error && <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</div>}

                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary hover:to-cyan-400 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/40 active:scale-[.98]"
                    disabled={busy}
                  >
                    {busy
                      ? (th ? "กำลังส่ง..." : "Sending...")
                      : <span className="inline-flex items-center gap-2"><MailCheck className="w-4 h-4" /> {th ? "ส่งรหัสยืนยันทางอีเมล" : "Email me a code"}</span>}
                  </Button>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> {th ? "ใช้งานฟรี ไม่มีค่าธรรมเนียมแรกเข้า" : "Free to join, no signup fee"}
                  </div>
                  </>
                 ) : (
                  <>
                  {/* ===== Step 2 — OTP verification ===== */}
                  <div className="text-center space-y-1.5">
                    <div className="mx-auto w-12 h-12 rounded-2xl icon-tile bg-brand flex items-center justify-center"><ShieldCheck className="w-6 h-6" /></div>
                    <h3 className="font-display font-bold text-lg pt-1">{th ? "ยืนยันอีเมลของคุณ" : "Verify your email"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {th ? "เราได้ส่งรหัส 6 หลักไปที่" : "We sent a 6-digit code to"}<br />
                      <span className="font-semibold text-foreground">{pendingEmail}</span>
                    </p>
                  </div>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="------"
                    className="h-14 rounded-xl text-center text-2xl font-bold tracking-[0.5em]"
                  />
                  {info && <div className="text-xs text-amber-600 text-center font-medium">{info}</div>}
                  {error && <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2 text-center">{error}</div>}
                  <Button type="button" onClick={onVerifyRegister} disabled={busy} className="w-full h-11 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/25">
                    {busy ? (th ? "กำลังยืนยัน..." : "Verifying...") : (th ? "ยืนยันและสมัครสมาชิก" : "Verify & create account")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={backToForm} className="w-full h-10 rounded-xl text-sm">
                    {th ? "ขอรหัสใหม่ / แก้ไขข้อมูล" : "Resend / edit details"}
                  </Button>
                  </>
                 )}
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <div className="text-sm text-muted-foreground">
                {t("auth.haveAccount")} <Link href="/login" className="text-primary font-semibold hover:underline">{t("nav.login")}</Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};
