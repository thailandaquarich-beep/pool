import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Package, Truck, CheckCircle, XCircle, MapPin, Phone, User, Receipt, TrendingUp, Wallet, CalendarDays, Clock } from "lucide-react";

type Item = { productId: number; name: string; price: number; qty: number };
type Order = {
  id: number; items: Item[]; subtotal: number; status: string; createdAt: string;
  recipientName: string; phone: string; address: string; subdistrict?: string; district?: string; province?: string; zipcode?: string;
  slipImageUrl?: string | null; trackingNo?: string | null; note?: string | null;
  paidAt?: string | null; shippedAt?: string | null;
  user?: { firstName: string; lastName: string; username: string };
};

const statusMap: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอชำระเงิน", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  paid: { label: "ชำระแล้ว รอจัดส่ง", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  shipped: { label: "จัดส่งแล้ว", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  cancelled: { label: "ยกเลิก", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export function AdminOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState<Order | null>(null);
  const [tracking, setTracking] = useState("");

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["orders", "admin", tab],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/orders${tab === "all" ? "" : `?status=${tab}`}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });

  type Revenue = { totalRevenue: number; todayRevenue: number; monthRevenue: number; pendingRevenue: number; paidOrders: number; topProducts: { name: string; qty: number; revenue: number }[] };
  const { data: revenue } = useQuery<Revenue>({
    queryKey: ["orders", "revenue"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/orders/admin/revenue`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { totalRevenue: 0, todayRevenue: 0, monthRevenue: 0, pendingRevenue: 0, paidOrders: 0, topProducts: [] };
      return r.json();
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status, trackingNo }: { id: number; status?: string; trackingNo?: string }) => {
      const r = await fetch(`${baseUrl}/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, trackingNo }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "อัปเดตคำสั่งซื้อแล้ว" });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setSelected(null); setTracking("");
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="คำสั่งซื้อสินค้า" subtitle="ตรวจสอบการชำระเงิน ที่อยู่ และจัดส่ง" icon={Package} gradient="from-fuchsia-400 to-pink-600" />

      {/* Revenue summary */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "รายได้ทั้งหมด", value: revenue?.totalRevenue ?? 0, icon: TrendingUp, grad: "from-emerald-500 to-green-600" },
          { label: "รายได้เดือนนี้", value: revenue?.monthRevenue ?? 0, icon: CalendarDays, grad: "from-sky-500 to-blue-600" },
          { label: "รายได้วันนี้", value: revenue?.todayRevenue ?? 0, icon: Wallet, grad: "from-violet-500 to-indigo-600" },
          { label: "รอชำระ (ค้างรับ)", value: revenue?.pendingRevenue ?? 0, icon: Clock, grad: "from-amber-500 to-orange-600" },
        ].map((s, i) => (
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

      {revenue?.topProducts?.length ? (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Package className="w-4 h-4 text-primary" /> สินค้าขายดี ({revenue.paidOrders} ออเดอร์ที่ชำระแล้ว)</div>
            <div className="space-y-1.5">
              {revenue.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground"><span className="font-mono text-xs mr-2">#{i + 1}</span>{p.name} <span className="text-xs">× {p.qty}</span></span>
                  <span className="font-semibold text-primary">{baht(p.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelected(null); }}>
        <TabsList>
          <TabsTrigger value="pending">รอชำระ</TabsTrigger>
          <TabsTrigger value="paid">รอจัดส่ง</TabsTrigger>
          <TabsTrigger value="shipped">จัดส่งแล้ว</TabsTrigger>
          <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : !orders?.length ? (
            <div className="text-center py-12 text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>ไม่มีคำสั่งซื้อ</p></div>
          ) : (
            <div className="space-y-3 mt-4">
              {orders.map((o) => (
                <Card key={o.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelected(o); setTracking(o.trackingNo ?? ""); }}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">#{o.id}</span>
                        <span className="text-sm">{o.user?.firstName} {o.user?.lastName}</span>
                        <Badge className={statusMap[o.status]?.cls}>{statusMap[o.status]?.label ?? o.status}</Badge>
                        {o.slipImageUrl && <Badge variant="outline" className="text-[10px] gap-1"><Receipt className="w-3 h-3" />มีสลิป</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{o.items.map((i) => `${i.name}×${i.qty}`).join(", ")}</p>
                      <p className="text-[11px] text-muted-foreground/70">{new Date(o.createdAt).toLocaleString("th-TH")}</p>
                    </div>
                    <div className="text-lg font-bold text-primary shrink-0">{baht(o.subtotal)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>คำสั่งซื้อ #{selected?.id}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div><Badge className={statusMap[selected.status]?.cls}>{statusMap[selected.status]?.label}</Badge></div>

              {/* Items */}
              <div className="rounded-xl bg-secondary/40 p-3 space-y-1">
                {selected.items.map((it, i) => (
                  <div key={i} className="flex justify-between"><span className="text-muted-foreground">{it.name} × {it.qty}</span><span>{baht(it.price * it.qty)}</span></div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t border-border mt-1"><span>รวม</span><span className="text-primary">{baht(selected.subtotal)}</span></div>
              </div>

              {/* Address */}
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" /> ที่อยู่จัดส่ง</div>
                <div className="flex items-center gap-1.5 text-muted-foreground"><User className="w-3.5 h-3.5" />{selected.recipientName}</div>
                <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5" />{selected.phone}</div>
                <div className="text-muted-foreground">{selected.address} {selected.subdistrict} {selected.district} {selected.province} {selected.zipcode}</div>
                {selected.note && <div className="text-xs text-muted-foreground">หมายเหตุ: {selected.note}</div>}
              </div>

              {/* Slip */}
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5"><Receipt className="w-4 h-4 text-primary" /> หลักฐานการชำระเงิน</div>
                {selected.slipImageUrl
                  ? <img src={selected.slipImageUrl} alt="slip" className="w-full max-h-64 object-contain rounded-lg border" />
                  : <p className="text-muted-foreground text-xs">ยังไม่มีสลิป (ลูกค้าแจ้งชำระภายหลัง)</p>}
              </div>

              {/* Actions */}
              {selected.status !== "cancelled" && (
                <div className="space-y-2 pt-1">
                  {selected.status === "pending" && (
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={() => update.mutate({ id: selected.id, status: "paid" })}>
                      <CheckCircle className="w-4 h-4" /> ยืนยันได้รับเงินแล้ว
                    </Button>
                  )}
                  {(selected.status === "pending" || selected.status === "paid") && (
                    <div className="flex gap-2">
                      <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="เลขพัสดุ (ถ้ามี)" />
                      <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 shrink-0" onClick={() => update.mutate({ id: selected.id, status: "shipped", trackingNo: tracking })}>
                        <Truck className="w-4 h-4" /> จัดส่งแล้ว
                      </Button>
                    </div>
                  )}
                  <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 gap-1.5" onClick={() => update.mutate({ id: selected.id, status: "cancelled" })}>
                    <XCircle className="w-4 h-4" /> ยกเลิกคำสั่งซื้อ
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
