import { FC } from "react";
import { useTranslation } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useGetAdminStats,
  useGetMonthlyStats,
  useGetTopUsers,
  getGetMonthlyStatsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Users, CalendarCheck, CalendarDays, BarChart2, TrendingUp, XCircle, LayoutDashboard, ShoppingBag, Wallet, Package, AlertTriangle, ArrowRight } from "lucide-react";
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

  // Shop sales + stock (real-time poll)
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [, navigate] = useLocation();
  type Revenue = { totalRevenue: number; todayRevenue: number; monthRevenue: number; pendingRevenue: number; paidOrders: number; counts: Record<string, number>; topProducts: { name: string; qty: number; revenue: number }[] };
  const { data: revenue } = useQuery<Revenue>({
    queryKey: ["orders", "revenue"], refetchInterval: 20000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/orders/admin/revenue`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { totalRevenue: 0, todayRevenue: 0, monthRevenue: 0, pendingRevenue: 0, paidOrders: 0, counts: {}, topProducts: [] };
      return r.json();
    },
  });
  type Prod = { id: number; name: string; stock: number | null; isActive: boolean };
  const { data: allProducts } = useQuery<Prod[]>({
    queryKey: ["products", "all"], refetchInterval: 20000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/products/all`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const lowStock = (allProducts || []).filter((p) => p.isActive && p.stock != null && p.stock <= 5);
  const baht = (n: number) => `฿${Number(n).toLocaleString("th-TH")}`;

  // Each card deep-links to the matching management page, pre-filtered to the exact set
  // the number represents (so the count on the card == the rows shown after the click).
  const statCards = [
    {
      label: t("admin.stats.members"),
      value: stats?.totalMembers ?? 0,
      icon: Users,
      grad: "from-blue-500 to-indigo-600",
      to: "/admin/members",
      hint: "จัดการสมาชิก",
    },
    {
      label: t("admin.stats.reservations"),
      value: stats?.totalReservations ?? 0,
      icon: CalendarCheck,
      grad: "from-emerald-500 to-green-600",
      to: "/admin/reservations",
      hint: "ดูการจองทั้งหมด",
    },
    {
      label: t("admin.stats.today"),
      value: stats?.todayReservations ?? 0,
      icon: CalendarDays,
      grad: "from-sky-500 to-cyan-600",
      to: "/admin/reservations?view=today",
      hint: "การจองวันนี้",
    },
    {
      label: t("admin.stats.monthly"),
      value: stats?.monthReservations ?? 0,
      icon: BarChart2,
      grad: "from-violet-500 to-purple-600",
      to: "/admin/reservations?view=month",
      hint: "การจองเดือนนี้",
    },
    {
      label: t("admin.stats.upcoming"),
      value: stats?.upcomingReservations ?? 0,
      icon: TrendingUp,
      grad: "from-amber-500 to-orange-600",
      to: "/admin/reservations?view=upcoming",
      hint: "คิวที่กำลังจะมาถึง",
    },
    {
      label: t("admin.stats.cancelled"),
      value: stats?.cancelledThisMonth ?? 0,
      icon: XCircle,
      grad: "from-rose-500 to-red-600",
      to: "/admin/reservations?view=cancelled",
      hint: "รายการที่ยกเลิกเดือนนี้",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.admin.dashboard")}
        icon={LayoutDashboard}
        gradient="from-sky-400 to-blue-600"
      />

      {/* Stat cards — each is a button that opens the matching page, pre-filtered */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => navigate(card.to)}
              title={card.hint}
              aria-label={`${card.label} — ${card.hint}`}
              data-testid={`card-stat-${card.label}`}
              className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl"
            >
              <Card className="h-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-1 hover:ring-primary/30">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">
                    {card.label}
                  </CardTitle>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${card.grad} text-white shadow-sm shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-primary opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                    {card.hint} <ArrowRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Shop (ร้านค้าสโมสร) sales dashboard */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-fuchsia-500" /> ยอดขายร้านค้าสโมสร</CardTitle>
            <button className="text-xs text-primary hover:underline" onClick={() => navigate("/admin/orders")}>ดูคำสั่งซื้อทั้งหมด →</button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "รายได้ทั้งหมด", value: baht(revenue?.totalRevenue ?? 0), icon: TrendingUp, c: "text-emerald-600" },
                { label: "เดือนนี้", value: baht(revenue?.monthRevenue ?? 0), icon: BarChart2, c: "text-sky-600" },
                { label: "วันนี้", value: baht(revenue?.todayRevenue ?? 0), icon: Wallet, c: "text-violet-600" },
                { label: "ออเดอร์ที่ขายได้", value: String(revenue?.paidOrders ?? 0), icon: Package, c: "text-fuchsia-600" },
              ].map((s, i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><s.icon className={`w-3.5 h-3.5 ${s.c}`} />{s.label}</div>
                  <div className="text-lg font-bold mt-0.5">{s.value}</div>
                </div>
              ))}
            </div>
            {revenue?.topProducts?.length ? (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">สินค้าขายดี</div>
                <div className="space-y-1">
                  {revenue.topProducts.slice(0, 4).map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate"><span className="font-mono text-xs mr-2">#{i + 1}</span>{p.name} <span className="text-xs">× {p.qty}</span></span>
                      <span className="font-semibold text-primary shrink-0">{baht(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-2">ยังไม่มียอดขาย</p>}
          </CardContent>
        </Card>

        {/* Low-stock alert */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> สต็อกใกล้หมด</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">สต็อกสินค้าทุกชิ้นเพียงพอ ✓</p>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 8).map((p) => (
                  <button key={p.id} onClick={() => navigate("/admin/products")} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-left">
                    <span className="text-sm truncate">{p.name}</span>
                    <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-full ${p.stock! <= 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                      {p.stock! <= 0 ? "หมด" : `เหลือ ${p.stock}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
