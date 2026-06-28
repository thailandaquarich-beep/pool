import { FC, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Ticket, Clock, History, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type UsagePackage = {
  memberPackageId: number;
  packageId: number;
  name: string;
  category?: string | null;
  endDate: string;
  quota: number | null;
  used: number;
  remaining: number | null;
  expired?: boolean;
};
type CourseUsage = { id: number; createdAt: string; source: string; packageName?: string; reservation?: { date: string; startTime: string; endTime: string } | null };
type CoursePurchase = { id: number; createdAt: string; packageName: string; amount: number; status: string };

export const MyPackages: FC = () => {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [packages, setPackages] = useState<UsagePackage[]>([]);
  const [usages, setUsages] = useState<CourseUsage[]>([]);
  const [purchases, setPurchases] = useState<CoursePurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [uRes, hRes] = await Promise.all([
        fetch(`${baseUrl}/api/packages/my-usage`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${baseUrl}/api/packages/my/history`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!alive) return;
      if (uRes.ok) { const u = await uRes.json(); setPackages(u.packages ?? []); }
      if (hRes.ok) { const h = await hRes.json(); setUsages(h.usages ?? []); setPurchases(h.purchases ?? []); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader title="สิทธิ์คงเหลือ & ประวัติการใช้งาน" subtitle="แพ็กเกจที่ใช้ได้และประวัติการใช้งานของคุณ" icon={Ticket} gradient="from-emerald-400 to-teal-600" />

      {/* แพ็กเกจคงเหลือ */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> แพ็กเกจคงเหลือ</div>
          {loading ? (
            <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
          ) : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีแพ็กเกจที่ใช้งานได้</p>
          ) : (
            <div className="space-y-2">
              {packages.map((p) => (
                <div key={p.memberPackageId} className={cn("rounded-xl border p-3 flex items-center gap-3", p.expired ? "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/10" : "border-border")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold truncate">{p.name}</span>
                      {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
                      {p.expired && <Badge className="bg-rose-500 text-white text-[10px]">หมดอายุแล้ว</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.expired ? "หมดอายุแล้วเมื่อ" : "หมดอายุ"} {fmtDate(p.endDate)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-primary">{p.remaining === null ? "ไม่จำกัด" : p.remaining}</div>
                    <div className="text-[10px] text-muted-foreground">{p.remaining === null ? "ครั้ง" : "ครั้งคงเหลือ"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ประวัติการใช้งานคอร์ส */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /> ประวัติการใช้งานคอร์ส</div>
          {!loading && usages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีประวัติการใช้งาน</p>
          ) : (
            <div className="space-y-1.5">
              {usages.slice(0, 50).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.packageName}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.source === "checkin" ? "เช็คอินหน้างาน" : "ใช้จากการจอง"}
                      {u.reservation ? ` · ${u.reservation.date} ${u.reservation.startTime}-${u.reservation.endTime}` : ""}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{fmtDate(u.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ประวัติการซื้อ/เติมแพ็กเกจ */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><History className="w-4 h-4 text-primary" /> ประวัติการซื้อ/เติมแพ็กเกจ</div>
          {!loading && purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีประวัติการซื้อแพ็กเกจ</p>
          ) : (
            <div className="space-y-1.5">
              {purchases.slice(0, 50).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.packageName}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</div>
                  </div>
                  <span className="font-semibold text-primary whitespace-nowrap shrink-0">฿{p.amount.toLocaleString("th-TH")}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
