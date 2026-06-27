import { FC, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, ImageIcon, Plus, Trash2, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const todayLocal = () => new Date().toLocaleDateString("en-CA");

type StaffUser = { id: number; firstName: string; lastName: string; role: string; profileImageUrl?: string | null };
type TaskStatus = "assigned" | "accepted" | "in_progress" | "completed" | "cancelled";
type AdminTask = {
  id: number;
  title: string;
  description: string | null;
  taskDate: string;
  status: TaskStatus;
  acceptedAt: string | null;
  startPhotoUrl: string | null;
  startPhotoTakenAt: string | null;
  endPhotoUrl: string | null;
  endPhotoTakenAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  user: StaffUser;
};

const statusText: Record<TaskStatus, string> = {
  assigned: "รอรับ",
  accepted: "รับแล้ว",
  in_progress: "กำลังทำ",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

const statusClass: Record<TaskStatus, string> = {
  assigned: "bg-slate-100 text-slate-700 border-slate-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "-";

const initials = (u: StaffUser) => `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase();
const roleLabel = (role: string) =>
  role === "instructor" ? "ครูฝึก" : role === "staff" ? "พนักงาน" : role === "super_admin" ? "Super Admin" : "แอดมิน";

const Avatar: FC<{ user: StaffUser }> = ({ user }) => (
  user.profileImageUrl
    ? <img src={user.profileImageUrl} alt="" className="w-10 h-10 rounded-xl object-cover ring-1 ring-border" />
    : <div className="w-10 h-10 rounded-xl icon-tile bg-brand flex items-center justify-center text-xs font-bold">{initials(user)}</div>
);

export const AdminWorkPlan: FC = () => {
  const { language } = useTranslation();
  const th = language === "th";
  const token = localStorage.getItem("pool_token");
  const auth = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(todayLocal());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const { data: staff = [] } = useQuery<StaffUser[]>({
    queryKey: ["attendance", "staff"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/attendance/staff`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const { data: tasks = [], isLoading } = useQuery<AdminTask[]>({
    queryKey: ["admin-tasks", date],
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/tasks?date=${date}`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const selectedStaffName = useMemo(() => {
    const u = staff.find((x) => String(x.id) === assignedTo);
    return u ? `${u.firstName} ${u.lastName}` : "";
  }, [staff, assignedTo]);

  const createTask = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${baseUrl}/api/tasks`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, taskDate: date, assignedTo: Number(assignedTo) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "สร้างภารกิจไม่สำเร็จ");
      return data;
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      toast({ title: "สร้างภารกิจแล้ว", description: selectedStaffName ? `มอบหมายให้ ${selectedStaffName}` : undefined });
      qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${baseUrl}/api/tasks/${id}`, { method: "DELETE", headers: auth });
      if (!r.ok) throw new Error("ลบภารกิจไม่สำเร็จ");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "ลบภารกิจแล้ว" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const submit = () => {
    if (!title.trim() || !assignedTo) {
      toast({ title: "กรุณากรอกชื่อภารกิจและเลือกพนักงาน", variant: "destructive" });
      return;
    }
    createTask.mutate();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl icon-tile bg-brand flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">{th ? "วางแผนงาน" : "Work plan"}</h1>
            <p className="text-sm text-muted-foreground">{th ? "มอบหมายภารกิจประจำวันให้พนักงาน และตรวจรูปก่อน-หลังพร้อมเวลา" : "Assign daily staff tasks and review before/after photos."}</p>
          </div>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-48 rounded-xl" />
      </div>

      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="font-display font-bold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> เพิ่มภารกิจประจำวัน
          </div>
          <div className="grid lg:grid-cols-[1fr_240px] gap-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อภารกิจ เช่น ตรวจความสะอาดสระ / จัดอุปกรณ์" className="rounded-xl" />
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="เลือกพนักงาน" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.firstName} {u.lastName} ({roleLabel(u.role)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียด/หมายเหตุการทำงาน" className="rounded-xl min-h-24" />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={createTask.isPending} className="rounded-xl">
              <UserCheck className="w-4 h-4 mr-2" /> มอบหมายงาน
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-4 sm:px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3">
            <div className="font-display font-bold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gold" /> ภารกิจวันที่ {date}
            </div>
            <Badge variant="outline">{tasks.length} งาน</Badge>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดภารกิจ...</div>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีภารกิจในวันที่เลือก</div>
          ) : (
            <div className="divide-y divide-border/60">
              {tasks.map((task) => (
                <div key={task.id} className="p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar user={task.user} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-display font-bold text-lg">{task.title}</h2>
                          <Badge variant="outline" className={statusClass[task.status]}>{statusText[task.status]}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {task.user.firstName} {task.user.lastName} • {roleLabel(task.user.role)}
                        </div>
                        {task.description && <p className="text-sm mt-2 whitespace-pre-wrap">{task.description}</p>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl self-start"
                      onClick={() => {
                        if (confirm("ลบภารกิจนี้?")) deleteTask.mutate(task.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> ลบ
                    </Button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-card/70 ring-1 ring-border/60 p-3 space-y-2">
                      <div className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" /> ก่อนเริ่มภารกิจ</div>
                      {task.startPhotoUrl ? (
                        <>
                          <img src={task.startPhotoUrl} alt="before task" className="w-full max-h-72 object-cover rounded-xl ring-1 ring-border" />
                          <div className="text-xs text-muted-foreground">เวลา: {fmtTime(task.startPhotoTakenAt)}</div>
                        </>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground rounded-xl bg-muted/40">ยังไม่มีรูปก่อนเริ่ม</div>
                      )}
                    </div>
                    <div className="rounded-2xl bg-card/70 ring-1 ring-border/60 p-3 space-y-2">
                      <div className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-emerald-600" /> หลังทำเสร็จ</div>
                      {task.endPhotoUrl ? (
                        <>
                          <img src={task.endPhotoUrl} alt="after task" className="w-full max-h-72 object-cover rounded-xl ring-1 ring-border" />
                          <div className="text-xs text-muted-foreground">เวลา: {fmtTime(task.endPhotoTakenAt)}</div>
                          {task.completionNote && <p className="text-sm whitespace-pre-wrap">{task.completionNote}</p>}
                        </>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground rounded-xl bg-muted/40">ยังไม่มีรูปหลังทำเสร็จ</div>
                      )}
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
