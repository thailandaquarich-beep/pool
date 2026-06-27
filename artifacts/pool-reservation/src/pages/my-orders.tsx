import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Truck, Clock, CheckCircle2, XCircle, Download } from "lucide-react";
import { downloadCsv, csvStamp } from "@/lib/export-csv";

type Item = { productId: number; name: string; price: number; qty: number };
type Order = {
  id: number; items: Item[]; subtotal: number; status: string; createdAt: string;
  recipientName: string; phone: string; address: string; subdistrict?: string; district?: string; province?: string; zipcode?: string;
  trackingNo?: string | null;
};

const statusMap: Record<string, { label: string; cls: string; icon: any }> = {
  pending: { label: "รอชำระเงิน", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Clock },
  paid: { label: "ชำระแล้ว รอจัดส่ง", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: CheckCircle2 },
  shipped: { label: "จัดส่งแล้ว", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: Truck },
  cancelled: { label: "ยกเลิก", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: XCircle },
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export const MyOrders: FC = () => {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["orders", "my"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/orders/my`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const paidOrders = (orders ?? []).filter((o) => o.status === "paid" || o.status === "shipped");
  const totalSpent = paidOrders.reduce((sum, o) => sum + o.subtotal, 0);
  const exportOrders = () => {
    downloadCsv(`my-orders-${csvStamp()}.csv`, [
      ["เลขที่", "วันที่", "สินค้า", "ยอดรวม", "สถานะ", "ผู้รับ", "เบอร์โทร", "ที่อยู่", "เลขพัสดุ"],
      ...(orders ?? []).map((o) => [
        o.id,
        new Date(o.createdAt).toLocaleString("th-TH"),
        o.items.map((it) => `${it.name} x${it.qty}`).join("; "),
        o.subtotal,
        statusMap[o.status]?.label ?? o.status,
        o.recipientName,
        o.phone,
        `${o.address} ${o.subdistrict ?? ""} ${o.district ?? ""} ${o.province ?? ""} ${o.zipcode ?? ""}`.trim(),
        o.trackingNo || "",
      ]),
    ]);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-extrabold flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> คำสั่งซื้อของฉัน</h1>
        <Button variant="outline" className="gap-1.5" onClick={exportOrders} disabled={!orders?.length}>
          <Download className="w-4 h-4" /> ดาวน์โหลดประวัติ
        </Button>
      </div>

      {!!orders?.length && (
        <Card className="bg-gradient-to-br from-primary/5 to-cyan-100/20 dark:to-cyan-900/10 border-primary/20">
          <CardContent className="p-4 flex items-center justify-around text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{baht(totalSpent)}</div>
              <div className="text-xs text-muted-foreground">ยอดซื้อสะสม</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div>
              <div className="text-2xl font-bold">{orders.length}</div>
              <div className="text-xs text-muted-foreground">คำสั่งซื้อทั้งหมด</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div>
              <div className="text-2xl font-bold text-emerald-600">{paidOrders.length}</div>
              <div className="text-xs text-muted-foreground">ชำระแล้ว</div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : !orders?.length ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <Package className="w-12 h-12 mx-auto opacity-30" />
          <p>ยังไม่มีคำสั่งซื้อ</p>
          <Button onClick={() => navigate("/products")}>เลือกซื้อสินค้า</Button>
        </div>
      ) : (
        orders.map((o) => {
          const s = statusMap[o.status] ?? statusMap.pending;
          const Icon = s.icon;
          return (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">คำสั่งซื้อ #{o.id}</div>
                  <Badge className={`gap-1 ${s.cls}`}><Icon className="w-3 h-3" />{s.label}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex justify-between text-muted-foreground">
                      <span>{it.name} × {it.qty}</span>
                      <span>{baht(it.price * it.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString("th-TH")}</span>
                  <span className="font-bold text-primary">{baht(o.subtotal)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  จัดส่ง: {o.recipientName} · {o.address} {o.subdistrict} {o.district} {o.province} {o.zipcode}
                </div>
                {o.trackingNo && <div className="text-xs"><Truck className="w-3 h-3 inline mr-1" />เลขพัสดุ: <span className="font-mono">{o.trackingNo}</span></div>}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
