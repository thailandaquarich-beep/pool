import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MemberAvatar } from "@/components/member-avatar";
import { CalendarOff, Check, X, Clock } from "lucide-react";
import { typeLabel, statusMeta } from "@/pages/leave";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

type Leave = {
  id: number; type: string; startDate: string; endDate: string; days: number;
  reason: string | null; status: string; reviewNote: string | null; createdAt: string;
  user: { id: number; firstName: string; lastName: string; role: string; profileImageUrl?: string | null };
};
const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });

export const AdminLeave: FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const auth = { Authorization: `Bearer ${token}` };
  const [tab, setTab] = useState("pending");
  const [review, setReview] = useState<{ row: Leave; action: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");

  const { data: rows } = useQuery<Leave[]>({
    queryKey: ["leave", "admin", tab],
    refetchInterval: 20000,
    queryFn: async () => {
      const q = tab === "all" ? "" : `?status=${tab}`;
      const r = await fetch(`${baseUrl}/api/leave${q}`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const decide = useMutation({
    mutationFn: async () => {
      if (!review) return;
      const r = await fetch(`${baseUrl}/api/leave/${review.row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ status: review.action, reviewNote: note }),
      });
      if (!r.ok) throw new Error("อัปเดตไม่สำเร็จ");
    },
    onSuccess: () => {
      toast({ title: review?.action === "approved" ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว" });
      setReview(null); setNote("");
      qc.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="icon-tile rounded-xl p-2 bg-gradient-to-br from-rose-400 to-pink-600 text-white"><CalendarOff className="w-5 h-5" /></span>
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight">คำขอลาพนักงาน</h1>
          <p className="text-sm text-muted-foreground">ตรวจและอนุมัติคำขอลาของพนักงาน</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">รออนุมัติ</TabsTrigger>
          <TabsTrigger value="approved">อนุมัติแล้ว</TabsTrigger>
          <TabsTrigger value="rejected">ไม่อนุมัติ</TabsTrigger>
          <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {!rows?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>ไม่มีคำขอลาในหมวดนี้</p>
          </div>
        ) : rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 flex items-start gap-3">
              <MemberAvatar firstName={r.user.firstName} lastName={r.user.lastName} src={r.user.profileImageUrl} className="w-10 h-10 text-sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.user.firstName} {r.user.lastName}</span>
                  <Badge variant="outline" className="text-[10px]">{typeLabel[r.type] || r.type}</Badge>
                  <Badge className={statusMeta[r.status]?.cls} variant="secondary">{statusMeta[r.status]?.label || r.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{fmt(r.startDate)} – {fmt(r.endDate)} · {r.days} วัน
                </div>
                {r.reason && <div className="text-xs mt-1">เหตุผล: {r.reason}</div>}
                {r.reviewNote && <div className="text-xs mt-1 text-muted-foreground">หมายเหตุ: {r.reviewNote}</div>}
              </div>
              {r.status === "pending" && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-500" onClick={() => { setReview({ row: r, action: "approved" }); setNote(""); }}>
                    <Check className="w-4 h-4 mr-1" />อนุมัติ
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => { setReview({ row: r, action: "rejected" }); setNote(""); }}>
                    <X className="w-4 h-4 mr-1" />ไม่อนุมัติ
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{review?.action === "approved" ? "อนุมัติคำขอลา" : "ไม่อนุมัติคำขอลา"}</DialogTitle>
          </DialogHeader>
          {review && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">{review.row.user.firstName} {review.row.user.lastName}</span>
                {" — "}{typeLabel[review.row.type]} {review.row.days} วัน ({fmt(review.row.startDate)} – {fmt(review.row.endDate)})
              </p>
              <Textarea rows={2} placeholder="หมายเหตุถึงพนักงาน (ถ้ามี)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>ยกเลิก</Button>
            <Button className={review?.action === "approved" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-destructive hover:bg-destructive/90"} onClick={() => decide.mutate()} disabled={decide.isPending}>
              {decide.isPending ? "กำลังบันทึก..." : review?.action === "approved" ? "ยืนยันอนุมัติ" : "ยืนยันไม่อนุมัติ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
