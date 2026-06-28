import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Instructor = {
  id: number;
  firstName: string;
  lastName: string;
  specialty: string | null;
};

type Avail = {
  id: number;
  kind: "weekly" | "date";
  dayOfWeek: number | null;
  date: string | null;
  startTime: string;
  endTime: string;
  maxPeople: number;
  packageId: number | null;
  note: string | null;
  isAvailable: boolean;
};

type AdminPackage = {
  id: number;
  name: string;
  category?: string | null;
  isActive: boolean;
};

type ScheduleForm = {
  kind: "weekly" | "date";
  dayOfWeek: string;
  date: string;
  startTime: string;
  endTime: string;
  maxPeople: string;
  packageId: string;
  note: string;
  isAvailable: boolean;
};

const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const BKK_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const emptyForm = (): ScheduleForm => ({
  kind: "weekly",
  dayOfWeek: "1",
  date: "",
  startTime: "17:00",
  endTime: "19:00",
  maxPeople: "5",
  packageId: "none",
  note: "",
  isAvailable: true,
});

export function AdminInstructorScheduleDialog({
  instructor,
  open,
  onOpenChange,
}: {
  instructor: Instructor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [form, setForm] = useState<ScheduleForm>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryKey = ["admin", "instructor-availability", instructor?.id];

  const { data: items = [], isLoading } = useQuery<Avail[]>({
    queryKey,
    enabled: open && !!instructor,
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/instructors/${instructor!.id}/availability`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || "โหลดตารางสอนไม่สำเร็จ");
      return data;
    },
  });

  const { data: packages = [] } = useQuery<AdminPackage[]>({
    queryKey: ["packages", "all"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/packages/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const packageNameById = new Map(packages.map((pkg) => [pkg.id, pkg.name]));

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setEditingId(null);
    }
  }, [open, instructor?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!instructor) throw new Error("ไม่พบครูฝึก");
      if (form.kind === "date" && !form.date) throw new Error("กรุณาเลือกวันที่");
      if (form.startTime >= form.endTime) throw new Error("เวลาเริ่มต้องก่อนเวลาสิ้นสุด");

      const maxPeople = Number(form.maxPeople);
      if (!Number.isInteger(maxPeople) || maxPeople < 0 || maxPeople > 99) throw new Error("จำนวนสมาชิกที่รับสอนต้องอยู่ระหว่าง 0-99 คน");

      const body = form.kind === "weekly"
        ? {
            kind: form.kind,
            dayOfWeek: Number(form.dayOfWeek),
            startTime: form.startTime,
            endTime: form.endTime,
            maxPeople,
            packageId: form.packageId === "none" ? null : Number(form.packageId),
            note: form.note,
            isAvailable: form.isAvailable,
          }
        : {
            kind: form.kind,
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            maxPeople,
            packageId: form.packageId === "none" ? null : Number(form.packageId),
            note: form.note,
            isAvailable: form.isAvailable,
          };
      const url = editingId == null
        ? `${baseUrl}/api/instructors/${instructor.id}/availability`
        : `${baseUrl}/api/instructors/${instructor.id}/availability/${editingId}`;
      const res = await fetch(url, {
        method: editingId == null ? "POST" : "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "บันทึกตารางสอนไม่สำเร็จ");
      return data as Avail;
    },
    onSuccess: () => {
      toast({ title: editingId == null ? "เพิ่มเวลาสอนแล้ว" : "แก้ไขเวลาสอนแล้ว" });
      qc.invalidateQueries({ queryKey });
      setForm(emptyForm());
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "บันทึกไม่สำเร็จ", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (slotId: number) => {
      if (!instructor) throw new Error("ไม่พบครูฝึก");
      const res = await fetch(`${baseUrl}/api/instructors/${instructor.id}/availability/${slotId}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ลบตารางสอนไม่สำเร็จ");
    },
    onSuccess: () => {
      toast({ title: "ลบเวลาสอนแล้ว" });
      qc.invalidateQueries({ queryKey });
      if (editingId) {
        setForm(emptyForm());
        setEditingId(null);
      }
    },
    onError: (e: any) => toast({ title: "ลบไม่สำเร็จ", description: e?.message, variant: "destructive" }),
  });

  const edit = (slot: Avail) => {
    setEditingId(slot.id);
    setForm({
      kind: slot.kind,
      dayOfWeek: String(slot.dayOfWeek ?? 1),
      date: slot.date ?? "",
      startTime: slot.startTime,
      endTime: slot.endTime,
      maxPeople: String(slot.maxPeople ?? 5),
      packageId: slot.packageId ? String(slot.packageId) : "none",
      note: slot.note ?? "",
      isAvailable: slot.isAvailable,
    });
  };

  const weekly = items
    .filter((i) => i.kind === "weekly")
    .sort((a, b) => (a.dayOfWeek! - b.dayOfWeek!) || a.startTime.localeCompare(b.startTime));
  const dates = items
    .filter((i) => i.kind === "date")
    .sort((a, b) => (a.date! + a.startTime).localeCompare(b.date! + b.startTime));

  const renderSlot = (slot: Avail) => (
    <div key={slot.id} className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          <span>{slot.kind === "weekly" ? DOW[slot.dayOfWeek ?? 0] : new Date(`${slot.date}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {slot.startTime}-{slot.endTime}
          </span>
          {slot.isAvailable && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">รับ {slot.maxPeople ?? 5} คน</span>}
          {!slot.isAvailable && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">ปิดรับสอน</span>}
        </div>
        {(slot.packageId || slot.note) && (
          <p className="truncate text-xs text-muted-foreground">
            {slot.packageId ? `คอร์ส: ${packageNameById.get(slot.packageId) ?? `#${slot.packageId}`}` : ""}
            {slot.packageId && slot.note ? " · " : ""}
            {slot.note ?? ""}
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => edit(slot)} aria-label="แก้ไขเวลาสอน">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
        disabled={deleteMutation.isPending}
        onClick={() => {
          if (window.confirm("ยืนยันลบเวลาสอนนี้หรือไม่?")) deleteMutation.mutate(slot.id);
        }}
        aria-label="ลบเวลาสอน"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            จัดตารางสอนครูฝึก
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {instructor ? `${instructor.firstName} ${instructor.lastName}${instructor.specialty ? ` · ${instructor.specialty}` : ""}` : ""}
          </p>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ตารางสอนประจำรายสัปดาห์</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : weekly.length ? weekly.map(renderSlot) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีตารางสอนรายสัปดาห์</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">วันเฉพาะ / วันหยุดพิเศษ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : dates.length ? dates.map(renderSlot) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีวันเฉพาะ</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {editingId == null ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editingId == null ? "เพิ่มเวลาสอน" : "แก้ไขเวลาสอน"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={form.kind === "weekly" ? "default" : "outline"} onClick={() => setForm((f) => ({ ...f, kind: "weekly" }))}>รายสัปดาห์</Button>
                <Button size="sm" variant={form.kind === "date" ? "default" : "outline"} onClick={() => setForm((f) => ({ ...f, kind: "date" }))}>วันเฉพาะ</Button>
              </div>

              {form.kind === "weekly" ? (
                <div className="space-y-1.5">
                  <Label>วันในสัปดาห์</Label>
                  <Select value={form.dayOfWeek} onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DOW.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>วันที่</Label>
                  <Input type="date" min={BKK_TODAY} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>เริ่ม</Label>
                  <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>สิ้นสุด</Label>
                  <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>จำนวนสมาชิกที่ครูรับสอน</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={form.maxPeople}
                  onChange={(e) => setForm((f) => ({ ...f, maxPeople: e.target.value }))}
                  placeholder="เช่น 5"
                />
                <p className="text-xs text-muted-foreground">กำหนดได้ 0-99 คนต่อรอบ ระบบสมาชิกจะเห็นและจองตามจำนวนนี้</p>
              </div>

              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="เช่น สอนเด็ก / สอนส่วนตัว" />
              </div>

              <div className="space-y-1.5">
                <Label>คอร์สสำหรับช่วงเวลานี้</Label>
                <Select value={form.packageId} onValueChange={(v) => setForm((f) => ({ ...f, packageId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่ระบุคอร์ส</SelectItem>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={String(pkg.id)}>
                        {pkg.category ? `[${pkg.category}] ` : ""}{pkg.name}{pkg.isActive === false ? " (ปิดใช้งาน)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">ถ้าระบุคอร์ส สมาชิกจะใช้ได้เฉพาะแพ็กเกจที่ตรงกับช่วงเวลาครูนี้</p>
              </div>

              <label className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3", !form.isAvailable && "border-amber-300 bg-amber-50")}>
                <div>
                  <p className="text-sm font-medium">เปิดให้จองเวลานี้</p>
                  <p className="text-xs text-muted-foreground">ปิดไว้เมื่อต้องการกันวันหยุดหรือเวลาที่ครูไม่รับสอน</p>
                </div>
                <Switch checked={form.isAvailable} onCheckedChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))} />
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {editingId != null && (
                  <Button variant="outline" disabled={saveMutation.isPending} onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    ยกเลิกแก้ไข
                  </Button>
                )}
                <Button className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  {saveMutation.isPending ? "กำลังบันทึก..." : editingId == null ? "เพิ่มเวลาสอน" : "บันทึกเวลาใหม่"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
