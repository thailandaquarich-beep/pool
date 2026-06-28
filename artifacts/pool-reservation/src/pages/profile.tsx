import { FC, useState, useRef, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Camera, User, Lock, Eye, EyeOff, Waves, Timer, CalendarCheck, CalendarHeart, History } from "lucide-react";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  username: z.string().min(3, "ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร"),
  weight: z.string().optional(),
  height: z.string().optional(),
  phone: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
});

const pwSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(6, "At least 6 characters"),
  confirmPassword: z.string().min(1, "Required"),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

export const Profile: FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const fileRef = useRef<HTMLInputElement>(null);

  const [avatar, setAvatar] = useState<string | null>((user as any)?.profileImageUrl || null);
  const [stats, setStats] = useState<{ totalVisits: number; totalMinutes: number; visitsThisMonth: number; bookingVisits: number; checkinVisits: number; lastVisit: string | null } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username || "",
      weight: (user as any)?.weight != null ? String((user as any).weight) : "",
      height: (user as any)?.height != null ? String((user as any).height) : "",
      phone: user?.phone || "",
      email: user?.email || "",
    },
  });

  const pwForm = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });

  // useAuth's user is fetched async — on a direct load of /profile it is null on first
  // render, so the form's one-time defaultValues come up empty. Re-sync once it arrives.
  useEffect(() => {
    if (!user) return;
    form.reset({
      username: user.username || "",
      weight: (user as any).weight != null ? String((user as any).weight) : "",
      height: (user as any).height != null ? String((user as any).height) : "",
      phone: user.phone || "",
      email: user.email || "",
    });
    setAvatar((user as any).profileImageUrl || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Swim activity stats (visits + total swim time).
  useEffect(() => {
    if (!token) return;
    fetch(`${baseUrl}/api/users/me/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fmtDuration = (min: number) => {
    const h = Math.floor(min / 60), m = min % 60;
    if (h && m) return `${h} ชม. ${m} นาที`;
    if (h) return `${h} ชม.`;
    return `${m} นาที`;
  };

  const qc = useQueryClient();
  const updateUser = useUpdateUser();

  const onSubmit = (data: z.infer<typeof profileSchema>) => {
    if (!user) return;
    updateUser.mutate({ id: user.id, data }, {
      onSuccess: () => {
        toast({ title: t("profile.updateSuccess") });
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }); // refresh useAuth user everywhere
      },
      onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast({ title: "รูปภาพใหญ่เกินไป (สูงสุด 3MB)", variant: "destructive" }); return; }
    setSavingAvatar(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target?.result as string;
      setAvatar(base64);
      try {
        const res = await fetch(`${baseUrl}/api/users/${user!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ profileImageUrl: base64 }),
        });
        if (!res.ok) throw new Error("Failed");
        toast({ title: "อัปเดตรูปโปรไฟล์สำเร็จ" });
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }); // refresh avatar in sidebar/header
      } catch {
        toast({ title: "ไม่สามารถบันทึกรูปได้", variant: "destructive" });
        setAvatar(null);
      } finally {
        setSavingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onChangePw = async (data: z.infer<typeof pwSchema>) => {
    setSavingPw(true);
    try {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast({ title: "เปลี่ยนรหัสผ่านสำเร็จ" });
      pwForm.reset();
      setShowPw(false);
    } catch (err: any) {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  };

  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() : "U";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-gradient">{t("profile.title")}</h1>

      {/* Avatar card */}
      <Card>
        <CardContent className="p-6 flex items-center gap-6">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center ring-4 ring-primary/20">
              {avatar ? (
                <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">{initials}</span>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={savingAvatar}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="font-semibold text-lg">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-muted-foreground">@{user?.username}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} disabled={savingAvatar}>
              <Camera className="w-4 h-4 mr-2" />{savingAvatar ? "กำลังบันทึก..." : t("profile.avatar")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Swim activity stats */}
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="flex flex-row items-center gap-2 bg-gradient-to-r from-primary/10 via-cyan-500/5 to-transparent">
          <Waves className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">สถิติการว่ายน้ำ</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: CalendarCheck, label: "จำนวนครั้งที่มาใช้", value: `${stats?.totalVisits ?? 0}`, unit: "ครั้ง", grad: "from-cyan-500 to-blue-600" },
              { icon: Timer, label: "เวลาว่ายน้ำรวม", value: stats ? fmtDuration(stats.totalMinutes) : "0 นาที", unit: "", grad: "from-sky-500 to-indigo-600" },
              { icon: CalendarHeart, label: "มาใช้เดือนนี้", value: `${stats?.visitsThisMonth ?? 0}`, unit: "ครั้ง", grad: "from-teal-500 to-emerald-600" },
              { icon: History, label: "มาใช้ล่าสุด", value: stats?.lastVisit ? new Date(stats.lastVisit).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—", unit: "", grad: "from-violet-500 to-fuchsia-600" },
            ].map((s, i) => (
              <div key={i} className={cn("relative overflow-hidden rounded-2xl p-4 text-white shadow-lg card-lift bg-gradient-to-br", s.grad)}>
                <s.icon className="w-5 h-5 opacity-90" />
                <div className="mt-2 text-2xl font-extrabold leading-tight tracking-tight">
                  {s.value}{s.unit && <span className="text-sm font-semibold text-white/80"> {s.unit}</span>}
                </div>
                <div className="text-[11px] font-medium text-white/85 mt-0.5">{s.label}</div>
                <s.icon className="absolute -right-3 -bottom-3 w-16 h-16 opacity-10" />
              </div>
            ))}
          </div>
          {stats && stats.totalVisits > 0 && (
            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarCheck className="w-3.5 h-3.5 text-primary" /> จองล่วงหน้า {stats.bookingVisits} ครั้ง</span>
              <span className="flex items-center gap-1"><Waves className="w-3.5 h-3.5 text-cyan-500" /> วอล์กอิน {stats.checkinVisits} ครั้ง</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile info */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">{t("nav.profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Real name is locked — members can't edit it (contact staff to change). */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("auth.firstName")}</Label>
                  <Input value={user?.firstName ?? ""} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>{t("auth.lastName")}</Label>
                  <Input value={user?.lastName ?? ""} disabled className="bg-muted" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">ชื่อจริง-นามสกุลแก้ไขไม่ได้ หากต้องการเปลี่ยนกรุณาติดต่อเจ้าหน้าที่</p>
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
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem><FormLabel>{t("auth.username")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="space-y-2">
                  <Label>{t("auth.memberCode")}</Label>
                  <Input value={(user as any)?.memberCode ?? "-"} disabled className="bg-muted font-mono font-semibold text-primary" />
                </div>
              </div>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 cursor-pointer" onClick={() => setShowPw(!showPw)}>
          <Lock className="w-5 h-5 text-primary" />
          <CardTitle className="text-base flex-1">{t("profile.changePassword")}</CardTitle>
          <span className="text-muted-foreground text-sm">{showPw ? "▲" : "▼"}</span>
        </CardHeader>
        {showPw && (
          <CardContent>
            <Form {...pwForm}>
              <form onSubmit={pwForm.handleSubmit(onChangePw)} className="space-y-4">
                <FormField control={pwForm.control} name="currentPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>รหัสผ่านปัจจุบัน</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPw ? "text" : "password"} {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={pwForm.control} name="newPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.newPassword")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showNewPw ? "text" : "password"} {...field} className="pr-10" />
                        <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={pwForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem><FormLabel>{t("auth.confirmPassword")}</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" disabled={savingPw}>
                  {savingPw ? "กำลังเปลี่ยน..." : t("profile.changePassword")}
                </Button>
              </form>
            </Form>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
