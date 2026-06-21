import { FC, useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getDeviceFingerprint } from "@/lib/device-id";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Waves, ShieldCheck, CalendarCheck, Clock, Globe } from "lucide-react";

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

const features = [
  { icon: CalendarCheck, title: "จองง่ายในไม่กี่วินาที", desc: "เลือกวัน-เวลา แล้วยืนยันได้ทันที" },
  { icon: Waves, title: "ครูฝึกมืออาชีพ", desc: "เลือกครูและจัดคิวฝึกของคุณเอง" },
  { icon: ShieldCheck, title: "ปลอดภัย เชื่อถือได้", desc: "ข้อมูลสมาชิกและการชำระเงินที่มั่นใจ" },
  { icon: Clock, title: "ใช้ได้ทุกที่ ทุกเวลา", desc: "รองรับทั้งคอมพิวเตอร์และมือถือ" },
];

export const Login: FC = () => {
  const { t, setLanguage, language } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { usernameOrEmail: "", password: "" },
  });

  const loginMutation = useLogin();

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    setError(null);
    // Attach a device fingerprint (pseudo-HWID) so the server can log the device.
    const payload = { ...data, deviceFingerprint: getDeviceFingerprint() };
    loginMutation.mutate({ data: payload as typeof data }, {
      onSuccess: (res) => {
        login(res.token, res.user);
        toast({
          title: t("auth.login.success") || "Login successful",
          description: `${t("common.welcome")} ${res.user.firstName}`,
        });
        setLocation(res.user.role === "admin" ? "/admin" : "/dashboard");
      },
      onError: (error: any) => {
        const errorMessage = error?.message || error?.response?.data?.error || "Login failed. Please try again.";
        setError(errorMessage);
        toast({ title: "Login Failed", description: errorMessage, variant: "destructive" });
      },
    });
  };

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col md:flex-row bg-aurora bg-aurora-animated relative overflow-hidden">
      {/* Parallax decorative blobs (drift with the cursor on desktop, auto-float on mobile) */}
      <div className="pointer-events-none absolute -top-24 -left-24 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * 46px), calc(var(--py,0) * 46px), 0)" }}>
        <div className="w-96 h-96 rounded-full bg-brand-from/30 blur-3xl animate-float" />
      </div>
      <div className="pointer-events-none absolute top-1/3 -right-20 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * -38px), calc(var(--py,0) * -28px), 0)" }}>
        <div className="w-80 h-80 rounded-full bg-brand-to/25 blur-3xl animate-float-slow" />
      </div>
      <div className="pointer-events-none absolute -bottom-24 left-1/4 will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * 30px), calc(var(--py,0) * -22px), 0)" }}>
        <div className="w-72 h-72 rounded-full bg-brand-via/20 blur-3xl animate-float" />
      </div>

      {/* ===== Form column ===== */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md space-y-6 animate-rise">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => setLanguage(language === "th" ? "en" : "th")}>
              <Globe className="w-4 h-4" /> {language === "th" ? "EN" : "ไทย"}
            </Button>
          </div>

          {/* Hero logo */}
          <div className="flex flex-col items-center text-center">
            <div className="relative inline-flex" style={{ transform: "translate3d(calc(var(--px,0) * -14px), calc(var(--py,0) * -14px), 0)" }}>
              <div aria-hidden className="absolute inset-0 -m-4 rounded-[2rem] bg-brand blur-2xl opacity-50 animate-float-slow" />
              <div className="relative bg-brand bg-brand-animated rounded-3xl p-3.5 shadow-2xl shadow-primary/30 ring-1 ring-white/30 sheen">
                <img src="/aquarich-logo.png" alt="Aquarich" className="w-16 h-16 object-contain drop-shadow-md select-none" draggable={false} />
              </div>
            </div>
            <h1 className="mt-4 text-4xl font-display font-extrabold text-gradient-shine tracking-tight">Aquarich</h1>
            <p className="text-sm text-muted-foreground mt-0.5">ศูนย์ดูแลสุขภาพครบวงจร</p>
          </div>

          <Card className="glass border-none shadow-2xl shadow-primary/10 rounded-2xl">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-display tracking-tight">{t("auth.login.title")}</CardTitle>
              <CardDescription>{t("auth.login.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <FormField control={form.control} name="usernameOrEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("auth.usernameOrEmail")}</FormLabel>
                      <FormControl>
                        <Input className="h-11 rounded-xl transition-shadow focus-visible:shadow-lg focus-visible:shadow-primary/20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("auth.password")}</FormLabel>
                      <FormControl>
                        <Input type="password" className="h-11 rounded-xl transition-shadow focus-visible:shadow-lg focus-visible:shadow-primary/20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary hover:to-cyan-400 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/40 active:scale-[.98]"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? t("common.loading") : t("nav.login")}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <div className="text-sm text-muted-foreground">
                {t("auth.noAccount")} <Link href="/register" className="text-primary font-semibold hover:underline">{t("nav.register")}</Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* ===== Desktop hero panel ===== */}
      <div className="hidden md:flex flex-1 bg-brand bg-brand-animated relative overflow-hidden sheen flex-col justify-center p-12 text-white">
        <div className="absolute inset-0 opacity-15 bg-[url('https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
        {/* parallax glow accents */}
        <div className="pointer-events-none absolute top-10 right-10 w-40 h-40 rounded-full bg-white/15 blur-3xl will-change-transform" style={{ transform: "translate3d(calc(var(--px,0) * -50px), calc(var(--py,0) * -40px), 0)" }} />

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl lg:text-5xl font-display font-extrabold leading-tight drop-shadow-lg">
            จองสระว่ายน้ำ<br />ง่าย ทุกที่ ทุกเวลา
          </h2>
          <p className="mt-3 text-white/85 text-lg">ครบ จบ ในที่เดียว — Aquarich</p>

          <div className="mt-8 space-y-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/15 px-4 py-3 animate-rise hover:bg-white/15 hover:translate-x-1 transition-all"
                style={{ animationDelay: `${150 + i * 90}ms` }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                  <f.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">{f.title}</div>
                  <div className="text-sm text-white/75">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
