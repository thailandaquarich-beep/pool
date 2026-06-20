import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useGetMemberStats, useGetUpcomingReservations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CalendarDays, CalendarCheck, CalendarX, Activity, Ticket, Wallet, CalendarClock, BadgeCheck } from "lucide-react";

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
    { label: "รหัสสมาชิก", value: memberCode, icon: BadgeCheck, grad: "from-indigo-500 to-violet-600", tint: "text-indigo-500" },
    { label: "ครั้งคงเหลือ", value: remaining === null ? "ไม่จำกัด" : `${remaining} ครั้ง`, icon: Ticket, grad: "from-emerald-500 to-teal-600", tint: "text-emerald-500" },
    { label: "ยอดเงินในกระเป๋า", value: `฿${balance.toLocaleString("th-TH")}`, icon: Wallet, grad: "from-amber-500 to-orange-600", tint: "text-amber-500" },
    { label: "ระยะเวลาสมาชิก", value: daysLeft === null ? "ไม่มีแพ็กเกจ" : `เหลือ ${daysLeft} วัน`, icon: CalendarClock, grad: "from-sky-500 to-blue-600", tint: "text-sky-500" },
  ];

  const statCards = [
    { label: t("dash.stats.total"),     value: stats?.totalReservations ?? 0, icon: Activity,      grad: "from-sky-500 to-blue-600",      tint: "text-sky-500" },
    { label: t("dash.stats.upcoming"),  value: stats?.upcomingCount ?? 0,     icon: CalendarCheck,  grad: "from-cyan-500 to-teal-600",     tint: "text-cyan-500" },
    { label: t("dash.stats.month"),     value: stats?.thisMonthCount ?? 0,    icon: CalendarDays,   grad: "from-violet-500 to-indigo-600", tint: "text-violet-500" },
    { label: t("dash.stats.cancelled"), value: stats?.cancelledCount ?? 0,    icon: CalendarX,      grad: "from-rose-500 to-red-600",      tint: "text-rose-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-extrabold tracking-tight text-gradient">{t("nav.dashboard")}</h1>
        <Button asChild>
          <Link href="/book">{t("dash.quickBook")}</Link>
        </Button>
      </div>

      {/* Membership summary — the key things a member needs to know */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {memberCards.map((s, i) => (
          <Card key={`m${i}`} className="card-lift relative overflow-hidden animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-gradient-to-br ${s.grad} opacity-15 blur-2xl`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <div className={`icon-tile p-2 rounded-xl bg-gradient-to-br ${s.grad}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-display font-extrabold tracking-tight truncate">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s, i) => (
          <Card key={i} className="card-lift relative overflow-hidden animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
            {/* corner gradient wash */}
            <div className={`pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-gradient-to-br ${s.grad} opacity-15 blur-2xl`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <div className={`icon-tile p-2 rounded-xl bg-gradient-to-br ${s.grad}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-extrabold tracking-tight">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 animate-rise" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="font-display">{t("dash.nextReservation")}</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming && upcoming.length > 0 ? (
               <div className="bg-brand-soft p-6 rounded-xl border border-primary/15 relative overflow-hidden">
                 <div className="text-lg font-semibold">{upcoming[0].date}</div>
                 <div className="text-muted-foreground">{upcoming[0].startTime} - {upcoming[0].endTime}</div>
                 <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand text-white shadow-sm">
                   {t("status.confirmed")}
                 </div>
               </div>
            ) : (
               <div className="text-center py-8 text-muted-foreground">
                 {t("dash.noUpcoming")}
               </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};