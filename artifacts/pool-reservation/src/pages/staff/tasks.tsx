import { FC, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ClipboardList, Clock3, PlayCircle, UploadCloud } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const todayLocal = () => new Date().toLocaleDateString("en-CA");

type StaffTask = {
  id: number;
  title: string;
  description: string | null;
  taskDate: string;
  status: "assigned" | "accepted" | "in_progress" | "completed" | "cancelled";
  acceptedAt: string | null;
  startPhotoUrl: string | null;
  startPhotoTakenAt: string | null;
  endPhotoUrl: string | null;
  endPhotoTakenAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  creator?: { firstName: string; lastName: string } | null;
};

const statusText = (status: StaffTask["status"]) => ({
  assigned: "รอรับภารกิจ",
  accepted: "รับแล้ว",
  in_progress: "กำลังทำ",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
}[status]);

const statusClass = (status: StaffTask["status"]) => ({
  assigned: "bg-slate-100 text-slate-700 border-slate-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
}[status]);

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "-";

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("กรุณาเลือกรูปภาพ"));
    if (file.size > 5.5 * 1024 * 1024) return reject(new Error("รูปใหญ่เกินไป กรุณาใช้ไม่เกินประมาณ 5MB"));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่ได้"));
    reader.readAsDataURL(file);
  });
}

export const StaffTasks: FC = () => {
  const { language } = useTranslation();
  const th = language === "th";
  const token = localStorage.getItem("pool_token");
  const auth = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(todayLocal());
  const [noteByTask, setNoteByTask] = useState<Record<number, string>>({});

  const { data: tasks = [], isLoading } = useQuery<StaffTask[]>({
    queryKey: ["staff-tasks", "me", date],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/tasks/me?date=${date}`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const postTask = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: "accept" | "start" | "complete"; body?: unknown }) => {
      const r = await fetch(`${baseUrl}/api/tasks/${id}/${action}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "ทำรายการไม่สำเร็จ");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-tasks"] });
      toast({ title: "บันทึกภารกิจแล้ว" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const uploadAndSend = async (task: StaffTask, file: File | undefined, action: "start" | "complete") => {
    if (!file) return;
    try {
      const photoDataUrl = await readPhoto(file);
      postTask.mutate({
        id: task.id,
        action,
        body: action === "complete" ? { photoDataUrl, completionNote: noteByTask[task.id] || "" } : { photoDataUrl },
      });
    } catch (e: any) {
      toast({ title: e?.message || "เลือกรูปไม่ได้", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl icon-tile bg-brand flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">{th ? "ภารกิจประจำวัน" : "Daily tasks"}</h1>
            <p className="text-sm text-muted-foreground">{th ? "รับงานจากแอดมิน ถ่ายรูปก่อนเริ่มและหลังทำเสร็จ" : "Accept assigned work and submit before/after photos."}</p>
          </div>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-48 rounded-xl" />
      </div>

      {isLoading ? (
        <Card className="glass rounded-2xl border-none shadow-lg"><CardContent className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดภารกิจ...</CardContent></Card>
      ) : tasks.length === 0 ? (
        <Card className="glass rounded-2xl border-none shadow-lg"><CardContent className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีภารกิจในวันนี้</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <Card key={task.id} className="glass rounded-2xl border-none shadow-lg overflow-hidden">
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display font-bold text-lg">{task.title}</h2>
                      <Badge variant="outline" className={statusClass(task.status)}>{statusText(task.status)}</Badge>
                    </div>
                    {task.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{task.description}</p>}
                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Clock3 className="w-3.5 h-3.5" /> วันที่ {task.taskDate}
                      {task.creator && <span>• จาก {task.creator.firstName} {task.creator.lastName}</span>}
                    </div>
                  </div>

                  {task.status === "assigned" && (
                    <Button disabled={postTask.isPending} onClick={() => postTask.mutate({ id: task.id, action: "accept" })} className="rounded-xl shrink-0">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> รับภารกิจ
                    </Button>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-card/70 ring-1 ring-border/60 p-3 space-y-2">
                    <div className="text-sm font-semibold flex items-center gap-2"><Camera className="w-4 h-4 text-primary" /> รูปก่อนเริ่ม</div>
                    {task.startPhotoUrl ? (
                      <>
                        <img src={task.startPhotoUrl} alt="before" className="w-full max-h-64 object-cover rounded-xl ring-1 ring-border" />
                        <div className="text-xs text-muted-foreground">ถ่ายเมื่อ {fmtTime(task.startPhotoTakenAt)}</div>
                      </>
                    ) : task.status !== "completed" && task.status !== "cancelled" ? (
                      <label className="block">
                        <Input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={postTask.isPending}
                          onChange={(e) => uploadAndSend(task, e.target.files?.[0], "start")}
                          className="hidden"
                        />
                        <div className="cursor-pointer rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-6 text-center text-sm text-primary hover:bg-primary/10 transition-colors">
                          <PlayCircle className="w-6 h-6 mx-auto mb-2" /> ถ่าย/อัปโหลดรูปก่อนเริ่ม
                        </div>
                      </label>
                    ) : <div className="text-sm text-muted-foreground">ไม่มีรูปก่อนเริ่ม</div>}
                  </div>

                  <div className="rounded-2xl bg-card/70 ring-1 ring-border/60 p-3 space-y-2">
                    <div className="text-sm font-semibold flex items-center gap-2"><UploadCloud className="w-4 h-4 text-emerald-600" /> รูปหลังทำเสร็จ</div>
                    {task.endPhotoUrl ? (
                      <>
                        <img src={task.endPhotoUrl} alt="after" className="w-full max-h-64 object-cover rounded-xl ring-1 ring-border" />
                        <div className="text-xs text-muted-foreground">ถ่ายเมื่อ {fmtTime(task.endPhotoTakenAt)}</div>
                        {task.completionNote && <p className="text-sm whitespace-pre-wrap">{task.completionNote}</p>}
                      </>
                    ) : task.startPhotoUrl && task.status !== "completed" && task.status !== "cancelled" ? (
                      <div className="space-y-2">
                        <Textarea
                          value={noteByTask[task.id] || ""}
                          onChange={(e) => setNoteByTask((s) => ({ ...s, [task.id]: e.target.value }))}
                          placeholder="หมายเหตุส่งงาน (ถ้ามี)"
                          className="rounded-xl"
                        />
                        <label className="block">
                          <Input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={postTask.isPending}
                            onChange={(e) => uploadAndSend(task, e.target.files?.[0], "complete")}
                            className="hidden"
                          />
                          <div className="cursor-pointer rounded-xl border border-dashed border-emerald-500/40 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700 hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-6 h-6 mx-auto mb-2" /> ถ่าย/อัปโหลดรูปหลังทำเสร็จ
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">ต้องถ่ายรูปก่อนเริ่มก่อน จึงจะส่งรูปหลังทำได้</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
