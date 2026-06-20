import { FC, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { BrandMark } from "@/components/brand";

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

export const Login: FC = () => {
  const { t, setLanguage, language } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      usernameOrEmail: "",
      password: "",
    },
  });

  const loginMutation = useLogin();

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    setError(null);
    loginMutation.mutate({ data }, {
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
        toast({
          title: "Login Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-aurora bg-aurora-animated relative overflow-hidden">
      {/* Floating decorative blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-from/30 blur-3xl animate-float" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-brand-to/25 blur-3xl animate-float-slow" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-brand-via/20 blur-3xl animate-float" />

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md space-y-8 animate-rise">
          <div className="flex items-center justify-between">
             <BrandMark size="md" />
             <Button variant="ghost" size="sm" onClick={() => setLanguage(language === "th" ? "en" : "th")}>
               {language === "th" ? "EN" : "ไทย"}
             </Button>
          </div>

          <Card className="glass border-none shadow-2xl shadow-primary/10">
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
                  <FormField
                    control={form.control}
                    name="usernameOrEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("auth.usernameOrEmail")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("auth.password")}</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? t("common.loading") : t("nav.login")}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <div className="text-sm text-muted-foreground">
                {t("auth.noAccount")} <Link href="/register" className="text-primary font-medium hover:underline">{t("nav.register")}</Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
      <div className="hidden md:block flex-1 bg-brand bg-brand-animated relative overflow-hidden sheen">
         {/* Photo + gradient veil */}
         <div className="absolute inset-0 opacity-15 bg-[url('https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay"></div>
         <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>
         {/* Tagline */}
         <div className="absolute bottom-0 left-0 right-0 p-12 text-white z-10">
            <h2 className="text-4xl font-display font-extrabold leading-tight drop-shadow-lg">
              จองสระว่ายน้ำ<br/>ง่าย ทุกที่ ทุกเวลา
            </h2>
            <p className="mt-3 text-white/80 max-w-sm">
              ระบบจองและจัดการสมาชิกสระว่ายน้ำ Aquarich — ครบ จบ ในที่เดียว
            </p>
         </div>
      </div>
    </div>
  );
};