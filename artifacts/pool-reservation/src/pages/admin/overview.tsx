import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Users, CalendarCheck, Wallet, Radio, Star, TrendingUp } from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const baht = (n: number) => `฿${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type BranchRow = {
  id: number; name: string; nameEn: string | null; code: string | null; isMain: boolean; isActive: boolean;
  members: number; reservations: number; reservationsToday: number; revenue: number; onDuty: number;
};
type Totals = { members: number; reservations: number; reservationsToday: number; revenue: number; onDuty: number };

/** super_admin cross-branch overview — totals + per-branch breakdown. */
export const AdminOverview: FC = () => {
  const token = localStorage.getItem("pool_token");
  const { data } = useQuery<{ branches: BranchRow[]; totals: Totals } | null>({
    queryKey: ["stats", "branches"],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/stats/branches`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : null;
    },
  });

  const t = data?.totals;
  const branches = data?.branches || [];

  const cards = [
    { icon: Users, label: "สมาชิกทั้งหมด", value: t ? t.members.toLocaleString() : "—", tint: "bg-brand" },
    { icon: CalendarCheck, label: "การจองวันนี้", value: t ? t.reservationsToday.toLocaleString() : "—", tint: "bg-gold" },
    { icon: Wallet, label: "รายได้รวม", value: t ? baht(t.revenue) : "—", tint: "bg-brand" },
    { icon: Radio, label: "กำลังปฏิบัติงาน", value: t ? t.onDuty.toLocaleString() : "—", tint: "bg-gold" },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl icon-tile bg-gold flex items-center justify-center"><TrendingUp className="w-6 h-6" /></div>
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight">ภาพรวมทุกสาขา</h1>
          <p className="text-sm text-muted-foreground">สรุปข้อมูลรวมและแยกตามสาขา — สำหรับผู้ดูแลแฟรนไชส์ (super admin)</p>
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <Card key={i} className="glass rounded-2xl border-none shadow-lg card-lift">
            <CardContent className="p-5">
              <div className={`w-10 h-10 rounded-xl icon-tile ${c.tint} flex items-center justify-center mb-3`}><c.icon className="w-5 h-5" /></div>
              <div className="text-2xl font-display font-extrabold text-gradient-gold tabular-nums">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-branch breakdown */}
      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-border/60 font-display font-bold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gold" /> แยกตามสาขา <span className="text-sm text-muted-foreground">({branches.length})</span>
          </div>

          {/* header row (desktop) */}
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-2 text-xs font-semibold text-muted-foreground border-b border-border/40">
            <span>สาขา</span><span className="text-right">สมาชิก</span><span className="text-right">จองทั้งหมด</span><span className="text-right">วันนี้</span><span className="text-right">รายได้</span><span className="text-right">ทำงานอยู่</span>
          </div>

          {branches.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลสาขา</div>
          ) : (
            <div className="divide-y divide-border/50">
              {branches.map((b) => (
                <div key={b.id} className="px-5 py-3">
                  {/* desktop row */}
                  <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 items-center text-sm">
                    <span className="font-medium inline-flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{b.name}</span>
                      {b.isMain && <Star className="w-3.5 h-3.5 text-gold shrink-0" />}
                      {!b.isActive && <span className="text-[10px] text-muted-foreground">(ปิด)</span>}
                    </span>
                    <span className="text-right tabular-nums">{b.members.toLocaleString()}</span>
                    <span className="text-right tabular-nums">{b.reservations.toLocaleString()}</span>
                    <span className="text-right tabular-nums">{b.reservationsToday.toLocaleString()}</span>
                    <span className="text-right tabular-nums font-semibold text-gradient-gold">{baht(b.revenue)}</span>
                    <span className="text-right tabular-nums inline-flex items-center justify-end gap-1">{b.onDuty > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}{b.onDuty}</span>
                  </div>
                  {/* mobile card */}
                  <div className="sm:hidden">
                    <div className="font-medium inline-flex items-center gap-1.5">{b.name}{b.isMain && <Star className="w-3.5 h-3.5 text-gold" />}</div>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>สมาชิก: <b className="text-foreground">{b.members}</b></span>
                      <span>จอง: <b className="text-foreground">{b.reservations}</b></span>
                      <span>วันนี้: <b className="text-foreground">{b.reservationsToday}</b></span>
                      <span>ทำงานอยู่: <b className="text-foreground">{b.onDuty}</b></span>
                      <span className="col-span-2">รายได้: <b className="text-gradient-gold">{baht(b.revenue)}</b></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
