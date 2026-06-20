import { FC } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useRegister } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand";
import { CheckCircle2 } from "lucide-react";

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

export const Register: FC = () => {
  const { t, setLanguage, language } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "", lastName: "", weight: "", height: "", phone: "",
      email: "", username: "", password: "", confirmPassword: ""
    },
  });

  const registerMutation = useRegister();

  const onSubmit = (data: z.infer<typeof registerSchema>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...submitData } = data;
    registerMutation.mutate({ data: submitData }, {
      onSuccess: (res) => {
        login(res.token, res.user);
        setLocation("/dashboard");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left: image hero (desktop only) */}
      <div className="hidden md:flex md:w-[42%] lg:w-2/5 bg-brand bg-brand-animated relative overflow-hidden sheen flex-col justify-between p-10 text-white">
        {/* photo + gradient veil */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1530549387789-4c1017266635?q=80&w=1974&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
        {/* floating blobs */}
        <div className="pointer-events-none absolute top-1/4 -left-16 w-64 h-64 rounded-full bg-white/10 blur-3xl animate-float" />
        <div className="pointer-events-none absolute bottom-10 right-0 w-56 h-56 rounded-full bg-brand-to/30 blur-3xl animate-float-slow" />

        <div className="relative z-10">
          <BrandMark size="md" />
        </div>
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-extrabold leading-tight drop-shadow-lg">
            เริ่มต้นว่ายน้ำ<br/>ไปกับ Aquarich
          </h2>
          <p className="text-white/85 max-w-xs">
            สมัครสมาชิกวันนี้ จองสระได้ทุกที่ทุกเวลา พร้อมสิทธิพิเศษและแพ็กเกจสุดคุ้ม
          </p>
          <ul className="space-y-2 pt-2 text-sm text-white/90">
            <li className="flex items-center gap-2"><span className="icon-tile rounded-lg p-1 bg-white/20"><CheckCircle2 className="w-4 h-4" /></span>จองสระออนไลน์ 24 ชม.</li>
            <li className="flex items-center gap-2"><span className="icon-tile rounded-lg p-1 bg-white/20"><CheckCircle2 className="w-4 h-4" /></span>กระเป๋าเงินและแพ็กเกจสมาชิก</li>
            <li className="flex items-center gap-2"><span className="icon-tile rounded-lg p-1 bg-white/20"><CheckCircle2 className="w-4 h-4" /></span>บัตรสมาชิกดิจิทัล + เช็คอินด้วย QR</li>
          </ul>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-aurora bg-aurora-animated relative overflow-hidden">
        {/* Floating decorative blobs */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-from/25 blur-3xl animate-float" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 w-80 h-80 rounded-full bg-brand-to/20 blur-3xl animate-float-slow" />

        <div className="w-full max-w-xl space-y-6 relative z-10 animate-rise">
           <div className="flex items-center justify-between">
             <div className="md:hidden"><BrandMark size="md" /></div>
             <span className="hidden md:block text-sm text-muted-foreground">มีบัญชีอยู่แล้ว? <Link href="/" className="text-gradient font-semibold">เข้าสู่ระบบ</Link></span>
             <Button variant="ghost" size="sm" onClick={() => setLanguage(language === "th" ? "en" : "th")}>
               {language === "th" ? "EN" : "ไทย"}
             </Button>
          </div>

          <Card className="glass border-none shadow-2xl shadow-primary/10">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-display tracking-tight">{t("auth.register.title")}</CardTitle>
              <CardDescription>{t("auth.register.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.firstName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.lastName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                     <FormField control={form.control} name="weight" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.weight")}</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                     <FormField control={form.control} name="height" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.height")}</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.phone")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>{t("auth.email")}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem><FormLabel>{t("auth.username")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.password")}</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                      <FormItem><FormLabel>{t("auth.confirmPassword")}</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? t("common.loading") : t("nav.register")}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <div className="text-sm text-muted-foreground">
                {t("auth.haveAccount")} <Link href="/" className="text-primary font-medium hover:underline">{t("nav.login")}</Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};