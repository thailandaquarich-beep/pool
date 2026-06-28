import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { downloadCsv, csvStamp } from "@/lib/export-csv";
import { useToast } from "@/hooks/use-toast";
import { Building2, CalendarCheck, Download, Gift, Radio, Star, TrendingUp, Users, Wallet } from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const baht = (n: number) => `฿${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type BranchRow = {
  id: number;
  name: string;
  nameEn: string | null;
  code: string | null;
  isMain: boolean;
  isActive: boolean;
  members: number;
  reservations: number;
  reservationsToday: number;
  revenue: number;
  orderRevenue: number;
  specialPackageRevenue: number;
  specialPackageCount: number;
  onDuty: number;
};

type Totals = {
  members: number;
  reservations: number;
  reservationsToday: number;
  revenue: number;
  orderRevenue: number;
  specialPackageRevenue: number;
  specialPackageCount: number;
  onDuty: number;
};

export const AdminOverview: FC = () => {
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const [exporting, setExporting] = useState(false);
  const [reportRange, setReportRange] = useState<"day" | "week" | "month" | "all">("month");

  const { data } = useQuery<{ branches: BranchRow[]; totals: Totals } | null>({
    queryKey: ["stats", "branches"],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/stats/branches`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : null;
    },
  });

  const totals = data?.totals;
  const branches = data?.branches || [];

  const cards = [
    { icon: Users, label: "สมาชิกทั้งหมด", value: totals ? totals.members.toLocaleString() : "-", tint: "bg-brand" },
    { icon: CalendarCheck, label: "การจองวันนี้", value: totals ? totals.reservationsToday.toLocaleString() : "-", tint: "bg-gold" },
    { icon: Wallet, label: "รายได้รวม", value: totals ? baht(totals.revenue) : "-", tint: "bg-brand" },
    { icon: Gift, label: "ยอดซื้อแพ็กเกจ", value: totals ? baht(totals.specialPackageRevenue) : "-", tint: "bg-gold" },
    { icon: Radio, label: "กำลังปฏิบัติงาน", value: totals ? totals.onDuty.toLocaleString() : "-", tint: "bg-gold" },
  ];

  async function exportPackagePurchases() {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ range: reportRange });
      const r = await fetch(`${baseUrl}/api/packages/admin/special-report?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "export failed");

      downloadCsv(`package-purchases-${reportRange}-${csvStamp()}.csv`, [
        ["วันที่", "เลขธุรกรรม", "รหัสสมาชิก", "ชื่อผู้ซื้อ", "เบอร์โทร", "รายการ", "ยอดเงิน", "สถานะ", "รายละเอียด"],
        ...(data.rows ?? []).map((row: any) => [
          row.createdAt ? new Date(row.createdAt).toLocaleString("th-TH") : "",
          row.transactionId ?? row.id,
          row.memberCode,
          row.memberName,
          row.phone,
          row.packageName,
          row.amount ?? row.pricePaid,
          row.status,
          row.description ?? "",
        ]),
      ]);
      toast({ title: "ดาวน์โหลดรายงานการซื้อแพ็กเกจแล้ว", description: `${data.rows?.length ?? 0} รายการ` });
    } catch (e: any) {
      toast({ title: "ดาวน์โหลดรายงานแพ็กเกจไม่สำเร็จ", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl icon-tile bg-gold flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">ภาพรวมทุกสาขา</h1>
            <p className="text-sm text-muted-foreground">สรุปข้อมูลรวมและแยกตามสาขา สำหรับผู้ดูแลแฟรนไชส์</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-10 rounded-full border bg-background px-3 text-sm" value={reportRange} onChange={(e) => setReportRange(e.target.value as any)}>
            <option value="day">รายวัน</option>
            <option value="week">รายสัปดาห์</option>
            <option value="month">รายเดือน</option>
            <option value="all">ทั้งหมด</option>
          </select>
          <Button variant="outline" className="gap-2 rounded-full" disabled={exporting} onClick={exportPackagePurchases}>
            <Download className="w-4 h-4" /> {exporting ? "กำลังดาวน์โหลด..." : "รายงานการซื้อแพ็กเกจ"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card, i) => (
          <Card key={i} className="glass rounded-2xl border-none shadow-lg card-lift">
            <CardContent className="p-5">
              <div className={`w-10 h-10 rounded-xl icon-tile ${card.tint} flex items-center justify-center mb-3`}>
                <card.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-display font-extrabold text-gradient-gold tabular-nums">{card.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-border/60 font-display font-bold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gold" /> แยกตามสาขา <span className="text-sm text-muted-foreground">({branches.length})</span>
          </div>

          <div className="hidden sm:grid grid-cols-[1.7fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.8fr] gap-2 px-5 py-2 text-xs font-semibold text-muted-foreground border-b border-border/40">
            <span>สาขา</span>
            <span className="text-right">สมาชิก</span>
            <span className="text-right">จองทั้งหมด</span>
            <span className="text-right">วันนี้</span>
            <span className="text-right">ร้านค้า</span>
            <span className="text-right">ซื้อแพ็กเกจ</span>
            <span className="text-right">รายได้รวม</span>
            <span className="text-right">ทำงานอยู่</span>
          </div>

          {branches.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลสาขา</div>
          ) : (
            <div className="divide-y divide-border/50">
              {branches.map((branch) => (
                <div key={branch.id} className="px-5 py-3">
                  <div className="hidden sm:grid grid-cols-[1.7fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.8fr] gap-2 items-center text-sm">
                    <span className="font-medium inline-flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{branch.name}</span>
                      {branch.isMain && <Star className="w-3.5 h-3.5 text-gold shrink-0" />}
                      {!branch.isActive && <span className="text-[10px] text-muted-foreground">(ปิด)</span>}
                    </span>
                    <span className="text-right tabular-nums">{branch.members.toLocaleString()}</span>
                    <span className="text-right tabular-nums">{branch.reservations.toLocaleString()}</span>
                    <span className="text-right tabular-nums">{branch.reservationsToday.toLocaleString()}</span>
                    <span className="text-right tabular-nums">{baht(branch.orderRevenue)}</span>
                    <span className="text-right tabular-nums text-amber-600 font-semibold">{baht(branch.specialPackageRevenue)}</span>
                    <span className="text-right tabular-nums font-semibold text-gradient-gold">{baht(branch.revenue)}</span>
                    <span className="text-right tabular-nums inline-flex items-center justify-end gap-1">
                      {branch.onDuty > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                      {branch.onDuty}
                    </span>
                  </div>

                  <div className="sm:hidden">
                    <div className="font-medium inline-flex items-center gap-1.5">
                      {branch.name}
                      {branch.isMain && <Star className="w-3.5 h-3.5 text-gold" />}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>สมาชิก: <b className="text-foreground">{branch.members}</b></span>
                      <span>จอง: <b className="text-foreground">{branch.reservations}</b></span>
                      <span>วันนี้: <b className="text-foreground">{branch.reservationsToday}</b></span>
                      <span>ทำงานอยู่: <b className="text-foreground">{branch.onDuty}</b></span>
                      <span>ร้านค้า: <b className="text-foreground">{baht(branch.orderRevenue)}</b></span>
                      <span>ซื้อแพ็กเกจ: <b className="text-amber-600">{baht(branch.specialPackageRevenue)}</b></span>
                      <span className="col-span-2">รายได้รวม: <b className="text-gradient-gold">{baht(branch.revenue)}</b></span>
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
