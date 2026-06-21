import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarOff, Plus, Trash2, Clock } from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

type Leave = {
  id: number; type: string; startDate: string; endDate: string; days: number;
  reason: string | null; status: string; reviewNote: string | null; createdAt: string;
};

export const typeLabel: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจ", vacation: "ลาพักร้อน", other: "อื่นๆ" };
export const statusMeta: Record<string, { label: string; cls: string }> = {
  pending: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  rejected: { label: "ไม่อนุมัติ", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  cancelled: { label: "ยกเลิก", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
};
const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });

/** Staff self-service: request leave + track approval status. */
export const LeavePage: FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const auth = { Authorization: `Bearer ${token}` };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "sick", startDate: "", endDate: "", reason: "" });

  const { data: rows } = useQuery<Leave[]>({
    queryKey: ["leave", "me"],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/leave/me`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${baseUrl}/api/leave`, {
        method: "POST", headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "ส่งคำขอไม่สำเร็จ");
      return j;
    },
    onSuccess: () => {
      toast({ title: "ส่งคำขอลาแล้ว", description: "รอแอดมินอนุมัติ" });
      setOpen(false);
      setForm({ type: "sick", startDate: "", endDate: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${baseUrl}/api/leave/${id}`, { method: "DELETE", headers: auth });
      if (!r.ok) throw new Error("ยกเลิกไม่สำเร็จ");
    },
    onSuccess: () => { toast({ title: "ยกเลิกคำขอแล้ว" }); qc.invalidateQueries({ queryKey: ["leave"] }); },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const days = form.startDate && form.endDate && form.endDate >= form.startDate
    ? Math.floor((Date.parse(form.endDate) - Date.parse(form.startDate)) / 86400000) + 1 : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="icon-tile rounded-xl p-2 bg-gradient-to-br from-rose-400 to-pink-600 text-white"><CalendarOff className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">การลา</h1>
            <p className="text-sm text-muted-foreground">ขอลาและติดตามสถานะการอนุมัติ</p>
          </div>
        </div>
        <Button onClick={() => setOpen((v) => !v)}><Plus className="w-4 h-4 mr-1.5" />ขอลา</Button>
      </div>

      {open && (
        <Card className="glass rounded-2xl border-none shadow-lg">
          <CardHeader><CardTitle className="text-base">ยื่นคำขอลา</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>ประเภทการลา</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(typeLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>วันที่เริ่ม</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate }))} />
              </div>
              <div className="space-y-1">
                <Label>ถึงวันที่</Label>
                <Input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>เหตุผล (ถ้ามี)</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="เช่น เป็นไข้ ต้องไปหาหมอ" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{days > 0 ? `รวม ${days} วัน` : "เลือกช่วงวันลา"}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
                <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.startDate || !form.endDate}>
                  {submit.isPending ? "กำลังส่ง..." : "ส่งคำขอ"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-border/60 font-display font-bold">ประวัติการลา</div>
          {!rows?.length ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">ยังไม่มีคำขอลา</div>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{typeLabel[r.type] || r.type}</span>
                      <Badge className={statusMeta[r.status]?.cls} variant="secondary">{statusMeta[r.status]?.label || r.status}</Badge>
                      <span className="text-muted-foreground text-xs">{r.days} วัน</span>
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{fmt(r.startDate)} – {fmt(r.endDate)}
                    </div>
                    {r.reason && <div className="text-xs mt-1">เหตุผล: {r.reason}</div>}
                    {r.reviewNote && <div className="text-xs mt-1 text-muted-foreground">หมายเหตุแอดมิน: {r.reviewNote}</div>}
                  </div>
                  {r.status === "pending" && (
                    <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:bg-destructive/10" onClick={() => cancel.mutate(r.id)} title="ยกเลิกคำขอ">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
