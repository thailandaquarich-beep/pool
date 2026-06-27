import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useGetMemberStats, useGetUpcomingReservations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Clock,
  FileText,
  GraduationCap,
  QrCode,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

export const Dashboard: FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: stats } = useGetMemberStats();
  const { data: upcoming } = useGetUpcomingReservations();

  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const memberCode = (user as any)?.memberCode ?? "-";

  const { data: usage } = useQuery<any>({
    queryKey: ["packages", "my-usage"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/packages/my-usage`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : { totalRemaining: 0, packages: [] };
    },
  });

  const { data: wallet } = useQuery<any>({
    queryKey: ["wallet", "me"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : { balance: 0 };
    },
  });

  const remaining = usage?.totalRemaining ?? 0;
  const balance = Number(wallet?.balance ?? 0);
  const pkg = usage?.packages?.[0];
  const daysLeft = pkg ? Math.max(0, Math.ceil((new Date(pkg.endDate).getTime() - Date.now()) / 86400000)) : null;

  const memberCards = [
    { label: "รหัสสมาชิก", value: memberCode, icon: BadgeCheck, href: "/membership-card", action: "เปิดบัตร", grad: "from-indigo-500 to-violet-600" },
    { label: "ครั้งคงเหลือ", value: remaining === null ? "ไม่จำกัด" : `${remaining} ครั้ง`, icon: Ticket, href: "/packages", action: "ดูแพ็คเกจ", grad: "from-emerald-500 to-teal-600" },
    { label: "ยอดเงินในกระเป๋า", value: `฿${balance.toLocaleString("th-TH")}`, icon: Wallet, href: "/wallet", action: "ดูกระเป๋า", grad: "from-amber-500 to-orange-600" },
    { label: "อายุสมาชิก", value: daysLeft === null ? "ไม่มีแพ็คเกจ" : `เหลือ ${daysLeft} วัน`, icon: CalendarClock, href: "/packages", action: "รายละเอียด", grad: "from-sky-500 to-blue-600" },
  ];

  const statCards = [
    { label: t("dash.stats.total"), value: stats?.totalReservations ?? 0, icon: Activity, href: "/reservations", action: "ดูทั้งหมด", grad: "from-sky-500 to-blue-600" },
    { label: t("dash.stats.upcoming"), value: stats?.upcomingCount ?? 0, icon: CalendarCheck, href: "/reservations", action: "ดูการจอง", grad: "from-cyan-500 to-teal-600" },
    { label: t("dash.stats.month"), value: stats?.thisMonthCount ?? 0, icon: CalendarDays, href: "/calendar", action: "ดูปฏิทิน", grad: "from-violet-500 to-indigo-600" },
    { label: t("dash.stats.cancelled"), value: stats?.cancelledCount ?? 0, icon: CalendarX, href: "/reservations", action: "ดูประวัติ", grad: "from-rose-500 to-red-600" },
  ];

  const reservations = (upcoming ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight text-gradient">{t("nav.dashboard")}</h1>
        <Button asChild className="shrink-0">
          <Link href="/book">{t("dash.quickBook")}</Link>
        </Button>
      </div>

      {/* Mobile mode */}
      <div className="space-y-3 md:hidden">
        {memberCards.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <Card className="overflow-hidden active:scale-[0.99] transition-transform">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`icon-tile p-3 rounded-xl bg-gradient-to-br ${s.grad}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-xl font-display font-extrabold truncate">{s.value}</div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="h-12 justify-start gap-2"><Link href="/membership-card"><QrCode className="h-4 w-4" />บัตรสมาชิก</Link></Button>
          <Button asChild variant="outline" className="h-12 justify-start gap-2"><Link href="/reservations"><CalendarDays className="h-4 w-4" />รายละเอียด</Link></Button>
        </div>
      </div>

      {/* PC mode */}
      <div className="hidden md:grid gap-4 grid-cols-2 lg:grid-cols-4">
        {memberCards.map((s, i) => (
          <Card key={s.label} className="card-lift relative overflow-hidden animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-gradient-to-br ${s.grad} opacity-15 blur-2xl`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <div className={`icon-tile p-2 rounded-xl bg-gradient-to-br ${s.grad}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-display font-extrabold tracking-tight truncate">{s.value}</div>
              <Button asChild variant="outline" size="sm" className="w-full justify-between">
                <Link href={s.href}>{s.action}<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s, i) => (
          <Card key={s.label} className="card-lift relative overflow-hidden animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
            <div className={`pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-gradient-to-br ${s.grad} opacity-15 blur-2xl`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <div className={`icon-tile p-2 rounded-xl bg-gradient-to-br ${s.grad}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-display font-extrabold tracking-tight">{s.value}</div>
              <Button asChild variant="ghost" size="sm" className="w-full justify-between md:hidden lg:flex">
                <Link href={s.href}>{s.action}<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="animate-rise" style={{ animationDelay: "300ms" }}>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="font-display">การจองที่กำลังจะมาถึง</CardTitle>
          <Button asChild variant="outline" size="sm"><Link href="/reservations">ดูรายละเอียด</Link></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {reservations.length > 0 ? reservations.map((r: any) => (
            <div key={r.id} className="bg-brand-soft p-4 rounded-xl border border-primary/15 relative overflow-hidden">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="text-base md:text-lg font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {new Date(`${r.date}T00:00:00`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {r.startTime} - {r.endTime}</span>
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {r.numberOfPeople} คน</span>
                    {r.package && <span className="flex items-center gap-1.5"><Ticket className="h-4 w-4" /> คอร์ส: {r.package.name}</span>}
                    {r.instructor && <span className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4" /> ครู {r.instructor.firstName} {r.instructor.lastName}</span>}
                    {r.notes && <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> {r.notes}</span>}
                  </div>
                </div>
                <Button asChild size="sm" variant="secondary" className="w-full lg:w-auto">
                  <Link href="/reservations">ดูรายละเอียด</Link>
                </Button>
              </div>
            </div>
          )) : (
            <div className="text-center py-8 text-muted-foreground">{t("dash.noUpcoming")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
