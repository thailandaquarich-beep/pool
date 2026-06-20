import { FC, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, CalendarClock, Trash2, Plus, Clock, Users, Phone, CheckCircle2, XCircle } from "lucide-react";
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

export const InstructorSchedule: FC = () => {
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [me, setMe] = useState<{ firstName: string; lastName: string; specialty: string } | null>(null);
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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const r = await fetch(`${baseUrl}/api/instructors/me/availability`, { headers });
    if (r.ok) setItems(await r.json());
  };
  const loadBookings = async () => {
    const r = await fetch(`${baseUrl}/api/instructors/me/bookings`, { headers });
    if (r.ok) setBookings(await r.json());
  };
  // Instructor confirms / rejects a booking on their own queue.
  const act = async (id: number, status: "confirmed" | "cancelled") => {
    setBusyId(id);
    try {
      const r = await fetch(`${baseUrl}/api/instructors/me/bookings/${id}`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
      toast({ title: status === "confirmed" ? "ยืนยันคิวแล้ว" : "ยกเลิกคิวแล้ว", description: status === "confirmed" ? "หักสิทธิ์สมาชิก 1 ครั้ง" : "คืนสิทธิ์ให้สมาชิกแล้ว" });
      await loadBookings();
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
      const r = await fetch(`${baseUrl}/api/instructors/me/availability`, { method: "POST", headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      toast({ title: "เพิ่มเวลาว่างแล้ว" });
      setNote("");
      await load();
    } catch { toast({ title: "เพิ่มไม่สำเร็จ", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    const r = await fetch(`${baseUrl}/api/instructors/me/availability/${id}`, { method: "DELETE", headers });
    if (r.ok) { setItems((s) => s.filter((x) => x.id !== id)); }
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
            <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50">
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
              <div className="flex items-center gap-1.5 shrink-0">
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
          ))}
        </CardContent>
      </Card>

      {/* Add form */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> เพิ่มเวลาที่จะมาสอน</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant={kind === "weekly" ? "default" : "outline"} size="sm" onClick={() => setKind("weekly")}>ประจำรายสัปดาห์</Button>
            <Button variant={kind === "date" ? "default" : "outline"} size="sm" onClick={() => setKind("date")}>วันที่เฉพาะ</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {kind === "weekly" ? (
              <div className="space-y-1 col-span-2">
                <Label>วันในสัปดาห์</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOW.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1 col-span-2">
                <Label>วันที่</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1"><Label>เวลาเริ่ม</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="space-y-1"><Label>เวลาสิ้นสุด</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            <div className="space-y-1 col-span-2"><Label>หมายเหตุ (ถ้ามี)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น สอนว่ายน้ำเด็ก" /></div>
          </div>
          <Button onClick={add} disabled={saving} className="w-full">{saving ? "กำลังบันทึก..." : "เพิ่มเวลาว่าง"}</Button>
        </CardContent>
      </Card>

      {/* Weekly list */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4" /> ประจำรายสัปดาห์</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {weekly.length === 0 ? <p className="text-sm text-muted-foreground text-center py-3">ยังไม่มี</p> :
            weekly.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50">
                <span className="font-medium text-sm w-20">{DOW[s.dayOfWeek!]}</span>
                <span className="text-sm flex items-center gap-1 text-muted-foreground"><Clock className="w-3.5 h-3.5" />{s.startTime}-{s.endTime}</span>
                {s.note && <span className="text-xs text-muted-foreground truncate">· {s.note}</span>}
                <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-destructive" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4" /></Button>
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
                <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-destructive" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
};
