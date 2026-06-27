import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, GraduationCap, Plus, Phone, Mail, Pencil, Trash2, KeyRound } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AdminInstructorScheduleDialog } from "./instructor-schedule-dialog";

type Instructor = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  certification: string | null;
  experience: string | null;
  biography: string | null;
  status: "active" | "on_leave" | "inactive";
};

type InstructorForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  specialty: string;
  certification: string;
  experience: string;
  biography: string;
  status: "active" | "on_leave" | "inactive";
  profileImageUrl: string;
};

const emptyForm = (): InstructorForm => ({
  firstName: "", lastName: "", phone: "", email: "",
  specialty: "", certification: "", experience: "", biography: "", status: "active",
  profileImageUrl: "",
});

const statusConfig = {
  active: { label: "ใช้งาน", className: "bg-emerald-500 hover:bg-emerald-600" },
  on_leave: { label: "ลาพัก", className: "bg-amber-500 hover:bg-amber-600" },
  inactive: { label: "ไม่ใช้งาน", className: "bg-slate-500 hover:bg-slate-600" },
};

export function AdminInstructors() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Instructor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Instructor | null>(null);
  const [acctTarget, setAcctTarget] = useState<Instructor | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Instructor | null>(null);
  const [acct, setAcct] = useState({ username: "", password: "" });
  const [form, setForm] = useState<InstructorForm>(emptyForm());

  const { data: instructors, isLoading } = useQuery<Instructor[]>({
    queryKey: ["instructors"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/instructors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InstructorForm) => {
      const res = await fetch(`${baseUrl}/api/instructors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "เพิ่มครูฝึกสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      setAddOpen(false);
      setForm(emptyForm());
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InstructorForm> }) => {
      const res = await fetch(`${baseUrl}/api/instructors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "แก้ไขสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      setEditTarget(null);
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${baseUrl}/api/instructors/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ลบครูฝึกสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const accountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { username: string; password: string } }) => {
      const res = await fetch(`${baseUrl}/api/instructors/${id}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ตั้งบัญชีล็อกอินครูสำเร็จ", description: "ครูใช้ชื่อผู้ใช้/รหัสนี้เข้าสู่ระบบเพื่อลงตารางสอนได้" });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      setAcctTarget(null); setAcct({ username: "", password: "" });
    },
    onError: (e: any) => toast({ title: "ตั้งบัญชีไม่สำเร็จ", description: String(e.message || ""), variant: "destructive" }),
  });

  function openEdit(inst: Instructor) {
    setForm({
      firstName: inst.firstName, lastName: inst.lastName,
      phone: inst.phone ?? "", email: inst.email ?? "",
      specialty: inst.specialty ?? "", certification: inst.certification ?? "",
      experience: inst.experience ?? "", biography: inst.biography ?? "",
      status: inst.status, profileImageUrl: (inst as any).profileImageUrl ?? "",
    });
    setEditTarget(inst);
  }

  const set = <K extends keyof InstructorForm>(k: K, v: InstructorForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const FormBody = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>รูปครูฝึก</Label>
        <ImageUpload value={form.profileImageUrl} onChange={(v) => set("profileImageUrl", v ?? "")} shape="circle" maxMb={3} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>ชื่อ *</Label>
          <Input value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="ชื่อ" />
        </div>
        <div className="space-y-1.5">
          <Label>นามสกุล *</Label>
          <Input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="นามสกุล" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>เบอร์โทร</Label>
          <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="0812345678" />
        </div>
        <div className="space-y-1.5">
          <Label>อีเมล</Label>
          <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>ความเชี่ยวชาญ</Label>
          <Input value={form.specialty} onChange={e => set("specialty", e.target.value)} placeholder="เช่น ว่ายน้ำ" />
        </div>
        <div className="space-y-1.5">
          <Label>ประสบการณ์</Label>
          <Input value={form.experience} onChange={e => set("experience", e.target.value)} placeholder="เช่น 5 ปี" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>ใบรับรอง</Label>
        <Input value={form.certification} onChange={e => set("certification", e.target.value)} placeholder="เช่น FINA Level 2" />
      </div>
      <div className="space-y-1.5">
        <Label>ประวัติย่อ</Label>
        <Textarea value={form.biography} onChange={e => set("biography", e.target.value)} rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>สถานะ</Label>
        <Select value={form.status} onValueChange={v => set("status", v as InstructorForm["status"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">ใช้งาน</SelectItem>
            <SelectItem value="on_leave">ลาพัก</SelectItem>
            <SelectItem value="inactive">ไม่ใช้งาน</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="ครูฝึกและผู้ฝึกสอน"
        subtitle="จัดการทีมครูฝึกของ Aquarich"
        icon={GraduationCap}
        gradient="from-emerald-400 to-teal-600"
        actions={
          <Button onClick={() => { setForm(emptyForm()); setAddOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> เพิ่มครูฝึก
          </Button>
        }
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              จัดตารางสอนครูฝึกโดยแอดมิน
            </Label>
            <p className="text-sm text-muted-foreground">เลือกครูฝึก แล้วเพิ่ม/แก้ไข/ลบเวลาสอนรายสัปดาห์หรือวันเฉพาะได้จากหลังบ้าน</p>
            <Select
              value={scheduleTarget ? String(scheduleTarget.id) : ""}
              onValueChange={(value) => {
                const inst = instructors?.find((i) => i.id === Number(value));
                if (inst) setScheduleTarget(inst);
              }}
              disabled={!instructors?.length}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={isLoading ? "กำลังโหลดรายชื่อครูฝึก..." : "เลือกครูฝึกเพื่อจัดตารางสอน"} />
              </SelectTrigger>
              <SelectContent>
                {instructors?.map((inst) => (
                  <SelectItem key={inst.id} value={String(inst.id)}>
                    {inst.firstName} {inst.lastName}{inst.specialty ? ` · ${inst.specialty}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="gap-2"
            disabled={!scheduleTarget}
            onClick={() => scheduleTarget && setScheduleTarget(scheduleTarget)}
          >
            <CalendarClock className="h-4 w-4" />
            เปิดตารางสอน
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !instructors?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีครูฝึก</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {instructors.map(inst => {
            const sc = statusConfig[inst.status];
            return (
              <Card key={inst.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-br from-primary/5 to-cyan-50/50 dark:from-primary/10 dark:to-cyan-900/20 p-6 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary mb-4 border-4 border-white dark:border-slate-800 shadow-sm">
                      {inst.firstName?.[0]}{inst.lastName?.[0]}
                    </div>
                    <h3 className="font-bold text-lg text-foreground">{inst.firstName} {inst.lastName}</h3>
                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                      {inst.specialty && <Badge variant="outline" className="text-xs">{inst.specialty}</Badge>}
                      <Badge className={cn("text-xs text-white", sc.className)}>{sc.label}</Badge>
                    </div>
                    {inst.experience && (
                      <p className="text-xs text-muted-foreground mt-2">ประสบการณ์ {inst.experience}</p>
                    )}
                  </div>
                  <div className="p-4 border-t space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{inst.phone ?? "–"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{inst.email ?? "–"}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setScheduleTarget(inst)}>
                        <CalendarClock className="w-3.5 h-3.5" /> ตารางสอน
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openEdit(inst)}>
                        <Pencil className="w-3.5 h-3.5" /> แก้ไข
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" title="ตั้งบัญชีล็อกอิน" onClick={() => { setAcct({ username: "", password: "" }); setAcctTarget(inst); }}>
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive gap-1.5" onClick={() => setDeleteTarget(inst)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AdminInstructorScheduleDialog
        instructor={scheduleTarget}
        open={!!scheduleTarget}
        onOpenChange={(open) => !open && setScheduleTarget(null)}
      />

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มครูฝึกใหม่</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button disabled={createMutation.isPending || !form.firstName || !form.lastName} onClick={() => createMutation.mutate(form)}>
              {createMutation.isPending ? "กำลังบันทึก..." : "เพิ่มครูฝึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>แก้ไขข้อมูลครูฝึก</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button disabled={updateMutation.isPending} onClick={() => editTarget && updateMutation.mutate({ id: editTarget.id, data: form })}>
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set instructor login account */}
      <Dialog open={!!acctTarget} onOpenChange={o => !o && setAcctTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ตั้งบัญชีล็อกอินครูฝึก</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            สร้างชื่อผู้ใช้/รหัสผ่านให้ <span className="font-medium text-foreground">{acctTarget?.firstName} {acctTarget?.lastName}</span> เพื่อให้ครูล็อกอินมาลงตารางสอนเองได้
          </p>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>ชื่อผู้ใช้</Label>
              <Input value={acct.username} onChange={e => setAcct(a => ({ ...a, username: e.target.value }))} placeholder="เช่น coach_somchai" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>รหัสผ่าน (อย่างน้อย 6 ตัว)</Label>
              <Input type="text" value={acct.password} onChange={e => setAcct(a => ({ ...a, password: e.target.value }))} placeholder="รหัสผ่าน" autoComplete="off" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcctTarget(null)}>ยกเลิก</Button>
            <Button disabled={accountMutation.isPending || !acct.username || acct.password.length < 6}
              onClick={() => acctTarget && accountMutation.mutate({ id: acctTarget.id, data: acct })}>
              {accountMutation.isPending ? "กำลังสร้าง..." : "สร้างบัญชี"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบครูฝึก</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ <span className="font-semibold">{deleteTarget?.firstName} {deleteTarget?.lastName}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? "กำลังลบ..." : "ลบ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
