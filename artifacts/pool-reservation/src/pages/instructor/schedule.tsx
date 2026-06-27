import { FC, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, CalendarClock, Trash2, Plus, Clock, Users, Phone, CheckCircle2, XCircle, GraduationCap, Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Avail = {
  id: number; kind: "weekly" | "date"; dayOfWeek: number | null; date: string | null;
  startTime: string; endTime: string; note: string | null; isAvailable: boolean;
};
type Booking = {
  id: number; date: string; startTime: string; endTime: string; numberOfPeople: number;
  status: string; notes: string | null;
  memberFirstName: string; memberLastName: string; memberHouseNumber: string | null; memberPhone: string | null;
};
const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const BKK_TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const InstructorSchedule: FC = () => {
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [me, setMe] = useState<{ firstName: string; lastName: string; specialty: string } | null>(null);
  const [stats, setStats] = useState<{ total: number; thisMonth: number } | null>(null);
  const [items, setItems] = useState<Avail[]>([]);
  const [kind, setKind] = useState<"weekly" | "date">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("19:00");
  const [note, setNote] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rescheduling, setRescheduling] = useState<{ id: number; date: string; startTime: string; endTime: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const r = await fetch(`${baseUrl}/api/instructors/me/availability`, { headers });
    if (r.ok) setItems(await r.json());
  };
  const loadBookings = async () => {
    const r = await fetch(`${baseUrl}/api/instructors/me/bookings`, { headers });
    if (r.ok) setBookings(await r.json());
  };
  const loadStats = async () => {
    const r = await fetch(`${baseUrl}/api/instructors/me/stats`, { headers });
    if (r.ok) setStats(await r.json());
  };
  // Instructor confirms / rejects a booking on their own queue.
  const act = async (id: number, status: "confirmed" | "cancelled") => {
    if (status === "cancelled" && !window.confirm("ยืนยันยกเลิกคิวฝึกนี้หรือไม่? สิทธิ์ที่ถูกหักจะคืนให้สมาชิก")) return;
    setBusyId(id);
    try {
      const r = await fetch(`${baseUrl}/api/instructors/me/bookings/${id}`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
      toast({ title: status === "confirmed" ? "ยืนยันคิวแล้ว" : "ยกเลิกคิวแล้ว", description: status === "confirmed" ? "หักสิทธิ์สมาชิก 1 ครั้ง" : "คืนสิทธิ์ให้สมาชิกแล้ว" });
      await loadBookings();
      await loadStats(); // confirming a session that has already occurred bumps the teaching tally
    } catch (e: any) {
      toast({ title: "ไม่สำเร็จ", description: e?.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };
  useEffect(() => {
    (async () => {
      const m = await fetch(`${baseUrl}/api/instructors/me`, { headers });
      if (m.ok) setMe(await m.json());
      await load();
      await loadBookings();
      await loadStats();
      setLoading(false);
    })();
    const iv = setInterval(loadBookings, 30000); // refresh incoming queue
    return () => clearInterval(iv);
  }, []);

  const add = async () => {
    if (kind === "date" && !date) { toast({ title: "กรุณาเลือกวันที่", variant: "destructive" }); return; }
    if (startTime >= endTime) { toast({ title: "เวลาเริ่มต้องก่อนเวลาสิ้นสุด", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = kind === "weekly"
        ? { kind, dayOfWeek: Number(dayOfWeek), startTime, endTime, note }
        : { kind, date, startTime, endTime, note };
      const url = editingId == null
        ? `${baseUrl}/api/instructors/me/availability`
        : `${baseUrl}/api/instructors/me/availability/${editingId}`;
      let r = await fetch(url, { method: editingId == null ? "POST" : "PATCH", headers, body: JSON.stringify(body) });
      let data = await r.json().catch(() => ({}));

      // Rolling-upgrade compatibility: older API processes do not have PATCH
      // /me/availability/:id yet. Create the replacement first, then remove the
      // old row so changing a weekly schedule still works without data loss.
      if (editingId != null && (r.status === 404 || r.status === 405)) {
        const create = await fetch(`${baseUrl}/api/instructors/me/availability`, {
          method: "POST", headers, body: JSON.stringify(body),
        });
        const created = await create.json().catch(() => ({}));
        if (!create.ok) throw new Error(created.error || "สร้างเวลาใหม่ไม่สำเร็จ");
        const removeOld = await fetch(`${baseUrl}/api/instructors/me/availability/${editingId}`, {
          method: "DELETE", headers,
        });
        if (!removeOld.ok) {
          throw new Error("สร้างเวลาใหม่แล้ว แต่ลบเวลาเดิมไม่สำเร็จ กรุณารีเฟรชและลบรายการเดิม");
        }
        r = create;
        data = created;
      }
      if (!r.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      if (editingId != null) {
        setItems((current) => current.map((slot) => slot.id === editingId ? data as Avail : slot));
      } else {
        setItems((current) => [...current, data as Avail]);
      }
      toast({ title: editingId == null ? "เพิ่มเวลาว่างแล้ว" : "แก้ไขเวลาแล้ว" });
      resetForm();
      await load();
    } catch (e: any) { toast({ title: "บันทึกไม่สำเร็จ", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!window.confirm("ยืนยันลบช่วงเวลานี้หรือไม่?")) return;
    const r = await fetch(`${baseUrl}/api/instructors/me/availability/${id}`, { method: "DELETE", headers });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      setItems((s) => s.filter((x) => x.id !== id));
      if (editingId === id) resetForm();
      toast({ title: "ลบช่วงเวลาแล้ว" });
    } else toast({ title: "ลบไม่สำเร็จ", description: data.error, variant: "destructive" });
  };

  const resetForm = () => {
    setEditingId(null); setKind("weekly"); setDayOfWeek("1"); setDate("");
    setStartTime("17:00"); setEndTime("19:00"); setNote("");
  };

  const edit = (slot: Avail) => {
    setEditingId(slot.id); setKind(slot.kind); setDayOfWeek(String(slot.dayOfWeek ?? 1));
    setDate(slot.date ?? ""); setStartTime(slot.startTime); setEndTime(slot.endTime); setNote(slot.note ?? "");
    document.getElementById("availability-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveReschedule = async () => {
    if (!rescheduling) return;
    if (!rescheduling.date || rescheduling.startTime >= rescheduling.endTime) {
      toast({ title: "กรุณาตรวจวันที่และเวลา", variant: "destructive" }); return;
    }
    setBusyId(rescheduling.id);
    try {
      const r = await fetch(`${baseUrl}/api/instructors/me/bookings/${rescheduling.id}`, {
        method: "PATCH", headers, body: JSON.stringify(rescheduling),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "เปลี่ยนเวลาไม่สำเร็จ");
      toast({ title: "เปลี่ยนเวลาคิวแล้ว", description: `${rescheduling.date} ${rescheduling.startTime}-${rescheduling.endTime}` });
      setRescheduling(null); await loadBookings();
    } catch (e: any) {
      toast({ title: "เปลี่ยนเวลาไม่สำเร็จ", description: e?.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const weekly = items.filter((i) => i.kind === "weekly").sort((a, b) => (a.dayOfWeek! - b.dayOfWeek!) || a.startTime.localeCompare(b.startTime));
  const dates = items.filter((i) => i.kind === "date").sort((a, b) => (a.date! + a.startTime).localeCompare(b.date! + b.startTime));

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!me) return (
    <div className="max-w-xl mx-auto text-center py-16 text-muted-foreground">
      บัญชีนี้ยังไม่ได้เชื่อมกับโปรไฟล์ครูฝึก กรุณาติดต่อผู้ดูแลระบบค่ะ
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarClock className="w-6 h-6" /> ตารางสอนของฉัน</h1>
        <p className="text-sm text-muted-foreground">ครูฝึก {me.firstName} {me.lastName} · {me.specialty}</p>
      </div>

      {/* Teaching tally — how many sessions this instructor has taught at the club */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">จำนวนครั้งที่มาสอนที่สโมสร</p>
            <p className="text-2xl font-bold leading-tight">
              {stats?.total ?? "—"} <span className="text-base font-medium text-muted-foreground">ครั้ง</span>
            </p>
          </div>
          {stats && stats.thisMonth > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">เดือนนี้</p>
              <p className="text-lg font-semibold text-primary">{stats.thisMonth} ครั้ง</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incoming bookings (customers who booked this instructor's queue) */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> คิวที่จองเข้ามาฝึก
            {bookings.length > 0 && <span className="ml-1 text-xs bg-primary text-white rounded-full px-2 py-0.5">{bookings.length}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">ยังไม่มีลูกค้าจองคิวฝึก</p>
          ) : bookings.map((b) => (
            <div key={b.id} className="p-3 rounded-lg bg-secondary/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {b.memberFirstName} {b.memberLastName}
                  {b.memberHouseNumber && <span className="text-xs text-muted-foreground font-normal"> · บ้าน {b.memberHouseNumber}</span>}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(b.date + "T00:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })} {b.startTime}-{b.endTime}</span>
                  <span>· {b.numberOfPeople} คน</span>
                  {b.memberPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.memberPhone}</span>}
                  {b.notes && <span>· {b.notes}</span>}
                </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busyId === b.id} onClick={() => setRescheduling({ id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime })}>
                    <Pencil className="w-3.5 h-3.5" /> เปลี่ยนเวลา
                  </Button>
                {b.status === "pending" ? (
                  <>
                    <Button size="sm" className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700" disabled={busyId === b.id} onClick={() => act(b.id, "confirmed")}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> ยืนยัน
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" disabled={busyId === b.id} onClick={() => act(b.id, "cancelled")}>
                      <XCircle className="w-3.5 h-3.5" /> ปฏิเสธ
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ยืนยันแล้ว</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" disabled={busyId === b.id} onClick={() => act(b.id, "cancelled")} title="ยกเลิกคิว">
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </>
                )}
                </div>
              </div>
              {rescheduling?.id === b.id && (
                <div className="border-t border-border/60 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input type="date" min={BKK_TODAY} value={rescheduling.date} onChange={(e) => setRescheduling((s) => s && ({ ...s, date: e.target.value }))} aria-label="วันที่ใหม่" />
                  <Input type="time" value={rescheduling.startTime} onChange={(e) => setRescheduling((s) => s && ({ ...s, startTime: e.target.value }))} aria-label="เวลาเริ่มใหม่" />
                  <Input type="time" value={rescheduling.endTime} onChange={(e) => setRescheduling((s) => s && ({ ...s, endTime: e.target.value }))} aria-label="เวลาสิ้นสุดใหม่" />
                  <div className="sm:col-span-3 flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRescheduling(null)}>ยกเลิก</Button>
                    <Button size="sm" onClick={saveReschedule} disabled={busyId === b.id}>บันทึกเวลาใหม่</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Add form */}
      <Card id="availability-form">
        <CardHeader><CardTitle className="text-base flex items-center gap-2">{editingId == null ? <Plus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />} {editingId == null ? "เพิ่มเวลาที่จะมาสอน" : "แก้ไขเวลาที่จะมาสอน"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={kind === "weekly" ? "default" : "outline"} size="sm" onClick={() => setKind("weekly")}>ประจำรายสัปดาห์</Button>
            <Button variant={kind === "date" ? "default" : "outline"} size="sm" onClick={() => setKind("date")}>วันที่เฉพาะ</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {kind === "weekly" ? (
              <div className="space-y-1 sm:col-span-2">
                <Label>วันในสัปดาห์</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOW.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <Label>วันที่</Label>
                <Input type="date" min={BKK_TODAY} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1"><Label>เวลาเริ่ม</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="space-y-1"><Label>เวลาสิ้นสุด</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>หมายเหตุ (ถ้ามี)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น สอนว่ายน้ำเด็ก" /></div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            {editingId != null && <Button variant="outline" onClick={resetForm} disabled={saving} className="sm:w-auto"><RotateCcw className="w-4 h-4 mr-2" />ยกเลิกแก้ไข</Button>}
            <Button onClick={add} disabled={saving} className="flex-1">{saving ? "กำลังบันทึก..." : editingId == null ? "เพิ่มเวลาว่าง" : "บันทึกเวลาใหม่"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly list */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4" /> ประจำรายสัปดาห์</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {weekly.length === 0 ? <p className="text-sm text-muted-foreground text-center py-3">ยังไม่มี</p> :
            weekly.map((s) => (
              <div key={s.id} className="flex items-center gap-2 sm:gap-3 p-2.5 rounded-lg bg-secondary/50">
                <span className="font-medium text-sm w-20">{DOW[s.dayOfWeek!]}</span>
                <span className="text-sm flex items-center gap-1 text-muted-foreground"><Clock className="w-3.5 h-3.5" />{s.startTime}-{s.endTime}</span>
                {s.note && <span className="text-xs text-muted-foreground truncate">· {s.note}</span>}
                <div className="ml-auto flex shrink-0"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(s)} aria-label="แก้ไขเวลา"><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(s.id)} aria-label="ลบเวลา"><Trash2 className="w-4 h-4" /></Button></div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Specific dates */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4" /> วันที่เฉพาะ</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {dates.length === 0 ? <p className="text-sm text-muted-foreground text-center py-3">ยังไม่มี</p> :
            dates.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50">
                <span className="font-medium text-sm">{new Date(s.date! + "T00:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="text-sm flex items-center gap-1 text-muted-foreground"><Clock className="w-3.5 h-3.5" />{s.startTime}-{s.endTime}</span>
                {s.note && <span className="text-xs text-muted-foreground truncate">· {s.note}</span>}
                <div className="ml-auto flex shrink-0"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(s)} aria-label="แก้ไขเวลา"><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(s.id)} aria-label="ลบเวลา"><Trash2 className="w-4 h-4" /></Button></div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
};
