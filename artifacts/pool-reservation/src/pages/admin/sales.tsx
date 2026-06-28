import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import {
  ShoppingBag, TrendingUp, Wallet, CalendarDays, Clock, Ticket, Package, Crown, Download, Receipt, Search,
} from "lucide-react";
import { downloadCsv, csvStamp } from "@/lib/export-csv";
import { AdminOrders } from "./orders";
import { AdminPackagesManagement } from "./packages-management";
import { AdminProducts } from "./products";

const baht = (n: number) => `฿${(n ?? 0).toLocaleString("th-TH")}`;

type Revenue = {
  totalRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  pendingRevenue: number;
  packageRevenue: number;
  packageTodayRevenue: number;
  packageMonthRevenue: number;
  paidOrders: number;
  counts: Record<string, number>;
  topProducts: { name: string; qty: number; revenue: number }[];
  topPackages: { name: string; qty: number; revenue: number }[];
};

type HistoryRow = {
  type: "product" | "package";
  typeLabel: string;
  id: number;
  createdAt: string;
  buyerName: string;
  memberCode: string;
  phone: string;
  itemSummary: string;
  amount: number;
  status: string;
};

// Human-readable status across both product orders and package purchases.
const STATUS_LABEL: Record<string, string> = {
  pending: "รอชำระ", paid: "ชำระแล้ว", shipped: "จัดส่งแล้ว", cancelled: "ยกเลิก",
  completed: "สำเร็จ", failed: "ไม่สำเร็จ", refunded: "คืนเงิน",
};
const statusLabel = (h: HistoryRow) => STATUS_LABEL[h.status] ?? h.status;

// Combined sales report: product orders + membership-package purchases in one view.
function SalesReport() {
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [range, setRange] = useState<"day" | "week" | "month" | "all">("month");
  const [exporting, setExporting] = useState(false);

  const { data: r, isLoading } = useQuery<Revenue>({
    queryKey: ["orders", "revenue"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/orders/admin/revenue`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const { data: history } = useQuery<HistoryRow[]>({
    queryKey: ["orders", "history"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/orders/admin/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const [histSearch, setHistSearch] = useState("");
  const filteredHistory = (history ?? []).filter((h) => {
    const q = histSearch.trim().toLowerCase();
    if (!q) return true;
    return [h.buyerName, h.memberCode, h.phone, h.itemSummary, h.typeLabel].join(" ").toLowerCase().includes(q);
  });

  const exportHistory = () => {
    downloadCsv(`purchase-history-${csvStamp()}.csv`, [
      ["วันเวลา", "ประเภท", "ผู้ซื้อ", "รหัสสมาชิก", "เบอร์โทร", "รายการ", "ยอดเงิน", "สถานะ"],
      ...filteredHistory.map((h) => [
        new Date(h.createdAt).toLocaleString("th-TH"),
        h.typeLabel,
        h.buyerName,
        h.memberCode,
        h.phone,
        h.itemSummary,
        h.amount,
        statusLabel(h),
      ]),
    ]);
  };

  const productTotal = r?.totalRevenue ?? 0;
  const packageTotal = r?.packageRevenue ?? 0;
  const grandTotal = productTotal + packageTotal;
  const monthTotal = (r?.monthRevenue ?? 0) + (r?.packageMonthRevenue ?? 0);
  const todayTotal = (r?.todayRevenue ?? 0) + (r?.packageTodayRevenue ?? 0);

  const exportPackages = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${baseUrl}/api/packages/admin/special-report?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "download failed");
      const rows = data?.rows ?? [];
      downloadCsv(`package-purchases-${range}-${csvStamp()}.csv`, [
        ["วันที่", "เลขธุรกรรม", "รหัสสมาชิก", "ชื่อผู้ซื้อ", "เบอร์โทร", "รายการ", "ยอดเงิน", "สถานะ", "รายละเอียด"],
        ...rows.map((row: any) => [
          row.createdAt ? new Date(row.createdAt).toLocaleString("th-TH") : "",
          row.transactionId ?? row.id,
          row.memberCode ?? "",
          row.buyerName ?? row.memberName ?? "",
          row.buyerPhone ?? row.phone ?? "",
          row.itemName ?? row.packageName ?? "",
          row.amount ?? row.pricePaid ?? 0,
          row.status ?? "",
          row.description ?? "",
        ]),
      ]);
      toast({ title: "ดาวน์โหลดรายงานการซื้อแพ็กเกจแล้ว", description: `${rows.length} รายการ` });
    } catch (e: any) {
      toast({ title: "ดาวน์โหลดรายงานไม่สำเร็จ", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const cards = [
    { label: "ยอดขายรวมทั้งหมด", value: grandTotal, icon: TrendingUp, grad: "from-emerald-500 to-green-600" },
    { label: "ยอดขายเดือนนี้", value: monthTotal, icon: CalendarDays, grad: "from-sky-500 to-blue-600" },
    { label: "ยอดขายวันนี้", value: todayTotal, icon: Wallet, grad: "from-violet-500 to-indigo-600" },
    { label: "ยอดขายสินค้า", value: productTotal, icon: ShoppingBag, grad: "from-fuchsia-500 to-pink-600" },
    { label: "ยอดขายแพ็กเกจ", value: packageTotal, icon: Ticket, grad: "from-cyan-500 to-teal-600" },
    { label: "รอชำระ (ค้างรับ)", value: r?.pendingRevenue ?? 0, icon: Clock, grad: "from-amber-500 to-orange-600" },
  ];

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {cards.map((s, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className={`pointer-events-none absolute -right-5 -top-5 w-20 h-20 rounded-full bg-gradient-to-br ${s.grad} opacity-15 blur-2xl`} />
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${s.grad} text-white`}><s.icon className="h-3.5 w-3.5" /></div>
              </div>
              <div className="text-2xl font-bold mt-1">{baht(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top sellers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-primary" /> สินค้าขายดี
              <span className="text-xs text-muted-foreground font-normal">({r?.paidOrders ?? 0} ออเดอร์ที่ชำระแล้ว)</span>
            </div>
            {r?.topProducts?.length ? (
              <div className="space-y-1.5">
                {r.topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground"><span className="font-mono text-xs mr-2">#{i + 1}</span>{p.name} <span className="text-xs">× {p.qty}</span></span>
                    <span className="font-semibold text-primary">{baht(p.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มียอดขายสินค้า</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> แพ็กเกจขายดี</div>
            {r?.topPackages?.length ? (
              <div className="space-y-1.5">
                {r.topPackages.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground"><span className="font-mono text-xs mr-2">#{i + 1}</span>{p.name} <span className="text-xs">× {p.qty}</span></span>
                    <span className="font-semibold text-primary">{baht(p.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มียอดขายแพ็กเกจ</p>}
          </CardContent>
        </Card>
      </div>

      {/* Unified purchase history (products + packages), newest first */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-primary" /> ประวัติการซื้อทั้งหมด
              <span className="text-xs text-muted-foreground font-normal">(สินค้า + แพ็กเกจ · ใหม่สุดก่อน)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={histSearch} onChange={(e) => setHistSearch(e.target.value)} placeholder="ค้นหาชื่อ/เบอร์/รายการ" className="h-9 w-52 pl-8" />
              </div>
              <Button variant="outline" className="gap-1.5" onClick={exportHistory} disabled={!filteredHistory.length} data-testid="export-purchase-history">
                <Download className="h-4 w-4" /> ดาวน์โหลดประวัติการซื้อ (CSV)
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-xs">
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">วันเวลา</th>
                  <th className="text-left font-medium px-3 py-2">ประเภท</th>
                  <th className="text-left font-medium px-3 py-2">ผู้ซื้อ</th>
                  <th className="text-left font-medium px-3 py-2">รายการ</th>
                  <th className="text-right font-medium px-3 py-2 whitespace-nowrap">ยอดเงิน</th>
                  <th className="text-left font-medium px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {!filteredHistory.length ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">ยังไม่มีประวัติการซื้อ</td></tr>
                ) : (
                  filteredHistory.slice(0, 300).map((h) => (
                    <tr key={`${h.type}-${h.id}`} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`gap-1 text-[10px] ${h.type === "package" ? "border-amber-300 text-amber-700 dark:text-amber-300" : "border-fuchsia-300 text-fuchsia-700 dark:text-fuchsia-300"}`}>
                          {h.type === "package" ? <Crown className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}{h.typeLabel}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{h.buyerName}</div>
                        {h.memberCode && <div className="text-[11px] text-muted-foreground font-mono">{h.memberCode}</div>}
                      </td>
                      <td className="px-3 py-2 max-w-[16rem] truncate" title={h.itemSummary}>{h.itemSummary}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{baht(h.amount)}</td>
                      <td className="px-3 py-2"><span className="text-xs text-muted-foreground">{statusLabel(h)}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredHistory.length > 300 && (
            <p className="text-[11px] text-muted-foreground text-center">แสดง 300 รายการล่าสุด · ดาวน์โหลด CSV เพื่อดูทั้งหมด ({filteredHistory.length} รายการ)</p>
          )}
        </CardContent>
      </Card>

      {/* Package-only report export (optional, by period) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Ticket className="w-4 h-4 text-primary" /> รายงานการซื้อแพ็กเกจตามช่วงเวลา</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">ช่วงเวลา:</span>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={range} onChange={(e) => setRange(e.target.value as any)} data-testid="package-report-range">
              <option value="day">รายวัน</option>
              <option value="week">รายสัปดาห์</option>
              <option value="month">รายเดือน</option>
              <option value="all">ทั้งหมด</option>
            </select>
            <Button variant="outline" className="gap-1.5" onClick={exportPackages} disabled={exporting} data-testid="export-package-purchases">
              <Ticket className="h-4 w-4" /> {exporting ? "กำลังดาวน์โหลด..." : "รายงานแพ็กเกจ (CSV)"}
            </Button>
            <span className="text-xs text-muted-foreground">· รายงานยอดขายสินค้าอยู่ในแท็บ “คำสั่งซื้อ”</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminSales() {
  const [tab, setTab] = useState("report");
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="ระบบการขาย"
        subtitle="รายงาน คำสั่งซื้อ แพ็กเกจ และผลิตภัณฑ์ ในที่เดียว"
        icon={ShoppingBag}
        gradient="from-fuchsia-400 to-pink-600"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="report" className="gap-1.5"><TrendingUp className="w-4 h-4" /> รายงาน</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><Package className="w-4 h-4" /> คำสั่งซื้อ</TabsTrigger>
          <TabsTrigger value="packages" className="gap-1.5"><Crown className="w-4 h-4" /> แพ็กเกจ</TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5"><ShoppingBag className="w-4 h-4" /> ผลิตภัณฑ์</TabsTrigger>
        </TabsList>
        <TabsContent value="report" className="mt-4">{tab === "report" && <SalesReport />}</TabsContent>
        <TabsContent value="orders" className="mt-4">{tab === "orders" && <AdminOrders embedded />}</TabsContent>
        <TabsContent value="packages" className="mt-4">{tab === "packages" && <AdminPackagesManagement embedded />}</TabsContent>
        <TabsContent value="products" className="mt-4">{tab === "products" && <AdminProducts embedded />}</TabsContent>
      </Tabs>
    </div>
  );
}
