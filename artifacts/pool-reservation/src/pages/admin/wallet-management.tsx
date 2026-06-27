import { FC, useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Wallet, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { downloadCsv, csvStamp } from "@/lib/export-csv";

type TopupRequest = {
  id: number; userId: number; amount: number; method: string; slipImageUrl?: string;
  note?: string; status: string; createdAt: string; reviewedAt?: string; reviewNote?: string;
  user: { id: number; firstName: string; lastName: string; username: string };
};

export const AdminWalletManagement: FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [selected, setSelected] = useState<TopupRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [exportRange, setExportRange] = useState<"day" | "month" | "year" | "all">("month");

  const fetchRequests = async (status?: string) => {
    setLoading(true);
    const url = `${baseUrl}/api/topup/admin${status ? `?status=${status}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRequests(activeTab === "all" ? undefined : activeTab); }, [activeTab]);

  const handleAction = async (action: "approve" | "reject") => {
    if (!selected) return;
    setProcessing(true);
    try {
      const res = await fetch(`${baseUrl}/api/topup/${selected.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewNote }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: action === "approve" ? "อนุมัติสำเร็จ" : "ปฏิเสธแล้ว" });
      setSelected(null);
      setReviewNote("");
      fetchRequests(activeTab === "all" ? undefined : activeTab);
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
    finally { setProcessing(false); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; class: string }> = {
      pending: { label: "รออนุมัติ", class: "bg-amber-100 text-amber-700" },
      approved: { label: "อนุมัติแล้ว", class: "bg-emerald-100 text-emerald-700" },
      rejected: { label: "ปฏิเสธ", class: "bg-red-100 text-red-700" },
    };
    const s = map[status] || { label: status, class: "" };
    return <Badge className={s.class}>{s.label}</Badge>;
  };

  const methodLabel: Record<string, string> = { bank_transfer: "โอนธนาคาร", qr_payment: "QR Payment", slip: "สลิป" };
  const exportRows = requests.filter((r) => {
    if (exportRange === "all") return true;
    const d = new Date(r.createdAt);
    const now = new Date();
    if (exportRange === "day") return d.toLocaleDateString("en-CA") === now.toLocaleDateString("en-CA");
    if (exportRange === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return d.getFullYear() === now.getFullYear();
  });
  const exportWallet = () => {
    downloadCsv(`wallet-topup-${exportRange}-${csvStamp()}.csv`, [
      ["เลขที่", "สมาชิก", "Username", "จำนวนเงิน", "วิธีชำระ", "สถานะ", "วันที่ส่ง", "วันที่ตรวจ", "หมายเหตุ", "หมายเหตุตรวจสอบ"],
      ...exportRows.map((r) => [
        r.id,
        `${r.user.firstName} ${r.user.lastName}`,
        r.user.username,
        r.amount,
        methodLabel[r.method] || r.method,
        r.status,
        new Date(r.createdAt).toLocaleString("th-TH"),
        r.reviewedAt ? new Date(r.reviewedAt).toLocaleString("th-TH") : "",
        r.note || "",
        r.reviewNote || "",
      ]),
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="จัดการกระเป๋าเงิน / การเติมเงิน"
        icon={Wallet}
        gradient="from-emerald-400 to-green-600"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select value={exportRange} onChange={(e) => setExportRange(e.target.value as any)} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="day">รายวัน</option>
              <option value="month">รายเดือน</option>
              <option value="year">รายปี</option>
              <option value="all">ทั้งหมด</option>
            </select>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportWallet} disabled={!exportRows.length}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">รออนุมัติ</TabsTrigger>
          <TabsTrigger value="approved">อนุมัติแล้ว</TabsTrigger>
          <TabsTrigger value="rejected">ปฏิเสธ</TabsTrigger>
          <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab}>
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Clock className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>ไม่มีรายการ</p></div>
          ) : (
            <div className="space-y-3 mt-4">
              {requests.map(r => (
                <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelected(r); setReviewNote(""); }}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{r.user.firstName} {r.user.lastName}</p>
                        <span className="text-muted-foreground text-sm">@{r.user.username}</span>
                        {statusBadge(r.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{methodLabel[r.method] || r.method} · {new Date(r.createdAt).toLocaleDateString("th-TH")}</p>
                      {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">฿{r.amount.toLocaleString()}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>รายละเอียดการเติมเงิน</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">ชื่อ</p><p className="font-medium">{selected.user.firstName} {selected.user.lastName}</p></div>
                <div><p className="text-muted-foreground">จำนวนเงิน</p><p className="font-bold text-primary text-lg">฿{selected.amount.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground">วิธีชำระ</p><p>{methodLabel[selected.method]}</p></div>
                <div><p className="text-muted-foreground">สถานะ</p>{statusBadge(selected.status)}</div>
              </div>
              {selected.note && <div><p className="text-sm text-muted-foreground">หมายเหตุ:</p><p className="text-sm">{selected.note}</p></div>}
              {selected.slipImageUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">สลิปการโอน:</p>
                  <img src={selected.slipImageUrl} alt="slip" className="w-full max-h-64 object-contain rounded-lg border" />
                </div>
              )}
              {selected.status === "pending" && (
                <div className="space-y-3">
                  <div>
                    <Label>หมายเหตุการตรวจสอบ (ไม่บังคับ)</Label>
                    <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="หมายเหตุ..." rows={2} className="mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAction("approve")} disabled={processing}>
                      <CheckCircle className="w-4 h-4 mr-2" />อนุมัติ
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => handleAction("reject")} disabled={processing}>
                      <XCircle className="w-4 h-4 mr-2" />ปฏิเสธ
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
