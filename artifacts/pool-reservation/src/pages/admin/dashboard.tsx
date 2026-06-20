import { FC } from "react";
import { useTranslation } from "@/i18n";
import {
  useGetAdminStats,
  useGetMonthlyStats,
  useGetTopUsers,
  getGetMonthlyStatsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Users, CalendarCheck, CalendarDays, BarChart2, TrendingUp, XCircle, LayoutDashboard } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const AdminDashboard: FC = () => {
  const { t } = useTranslation();
  const { data: stats } = useGetAdminStats();
  const { data: monthlyData } = useGetMonthlyStats(
    {},
    { query: { queryKey: getGetMonthlyStatsQueryKey({}) } }
  );
  const { data: topUsers } = useGetTopUsers();

  const statCards = [
    {
      label: t("admin.stats.members"),
      value: stats?.totalMembers ?? 0,
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: t("admin.stats.reservations"),
      value: stats?.totalReservations ?? 0,
      icon: CalendarCheck,
      color: "text-green-500",
    },
    {
      label: t("admin.stats.today"),
      value: stats?.todayReservations ?? 0,
      icon: CalendarDays,
      color: "text-primary",
    },
    {
      label: t("admin.stats.monthly"),
      value: stats?.monthReservations ?? 0,
      icon: BarChart2,
      color: "text-purple-500",
    },
    {
      label: t("admin.stats.upcoming"),
      value: stats?.upcomingReservations ?? 0,
      icon: TrendingUp,
      color: "text-amber-500",
    },
    {
      label: t("admin.stats.cancelled"),
      value: stats?.cancelledThisMonth ?? 0,
      icon: XCircle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.admin.dashboard")}
        icon={LayoutDashboard}
        gradient="from-sky-400 to-blue-600"
      />

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} data-testid={`card-stat-${card.label}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">
                  {card.label}
                </CardTitle>
                <Icon className={`h-4 w-4 shrink-0 ${card.color}`} />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts + top users */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-7">
        {/* Monthly bar chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.monthlyChart")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] sm:h-[320px]">
            {monthlyData && monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--accent))" }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    name={t("admin.stats.reservations")}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top users */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.topUsers")}</CardTitle>
          </CardHeader>
          <CardContent>
            {topUsers && topUsers.length > 0 ? (
              <div className="space-y-3">
                {topUsers.slice(0, 6).map((u, i) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3"
                    data-testid={`row-top-user-${u.id}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {u.firstName} {u.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {(u as any).memberCode ?? ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-primary shrink-0">
                      {u.reservationCount}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
