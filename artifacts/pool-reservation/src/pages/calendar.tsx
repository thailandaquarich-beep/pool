import { FC, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Users,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CalSlot = {
  instructorId: number;
  firstName: string;
  lastName: string;
  specialty: string | null;
  startTime: string;
  endTime: string;
  note: string | null;
  maxPeople: number;
  packageId: number | null;
  packageName: string | null;
};
type CalInstructor = {
  id: number;
  firstName: string;
  lastName: string;
  specialty: string | null;
  profileImageUrl: string | null;
};
type CalData = {
  month: string;
  instructors: CalInstructor[];
  days: Record<string, CalSlot[]>;
};

const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTHS_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Distinct, color-blind-friendly palette assigned to each instructor by index.
const PALETTE = [
  "#0ea5e9", "#f97316", "#22c55e", "#a855f7", "#ec4899",
  "#eab308", "#14b8a6", "#ef4444", "#6366f1", "#84cc16",
];

const pad = (n: number) => String(n).padStart(2, "0");
const bkkToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const Calendar: FC = () => {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const todayStr = bkkToday.format(new Date());

  // Month cursor (m is 1-based). Defaults to the current Bangkok month.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayStr.split("-").map(Number);
    return { y, m };
  });
  const [filter, setFilter] = useState<string>("all");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const monthStr = `${cursor.y}-${pad(cursor.m)}`;

  const { data, isLoading } = useQuery<CalData>({
    queryKey: ["instructors", "calendar", monthStr],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/instructors/calendar?month=${monthStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { month: monthStr, instructors: [], days: {} };
      return res.json();
    },
  });

  // Color per instructor id (stable within a month, by listing order).
  const colorById = useMemo(() => {
    const map = new Map<number, string>();
    (data?.instructors ?? []).forEach((inst, i) => map.set(inst.id, PALETTE[i % PALETTE.length]));
    return map;
  }, [data]);

  // Apply the instructor filter to every day's slot list.
  const days = useMemo(() => {
    const src = data?.days ?? {};
    if (filter === "all") return src;
    const id = Number(filter);
    const out: Record<string, CalSlot[]> = {};
    for (const [date, slots] of Object.entries(src)) {
      const kept = slots.filter((s) => s.instructorId === id);
      if (kept.length) out[date] = kept;
    }
    return out;
  }, [data, filter]);

  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
  const firstDow = new Date(`${monthStr}-01T00:00:00Z`).getUTCDay();

  // Chart: number of teaching slots + distinct teachers for each day of the month.
  const chartData = useMemo(() => {
    const arr: { day: number; sessions: number; teachers: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const slots = days[`${monthStr}-${pad(d)}`] ?? [];
      arr.push({
        day: d,
        sessions: slots.length,
        teachers: new Set(slots.map((s) => s.instructorId)).size,
      });
    }
    return arr;
  }, [days, monthStr, daysInMonth]);

  // Per-instructor summary for the table: days taught + total slots this month.
  const summary = useMemo(() => {
    const byId = new Map<number, { inst: CalInstructor; daySet: Set<string>; slots: number }>();
    for (const inst of data?.instructors ?? []) byId.set(inst.id, { inst, daySet: new Set(), slots: 0 });
    for (const [date, slots] of Object.entries(days)) {
      for (const s of slots) {
        const rec = byId.get(s.instructorId);
        if (!rec) continue;
        rec.daySet.add(date);
        rec.slots += 1;
      }
    }
    return [...byId.values()]
      .map((r) => ({ inst: r.inst, days: r.daySet.size, slots: r.slots }))
      .filter((r) => r.days > 0)
      .sort((a, b) => b.days - a.days || b.slots - a.slots);
  }, [data, days]);

  const totalSlots = chartData.reduce((s, d) => s + d.sessions, 0);

  const goMonth = (delta: number) => {
    setOpenDay(null);
    setCursor((c) => {
      const idx = c.m - 1 + delta;
      const y = c.y + Math.floor(idx / 12);
      const m = ((idx % 12) + 12) % 12 + 1;
      return { y, m };
    });
  };
  const goToday = () => {
    const [y, m] = todayStr.split("-").map(Number);
    setCursor({ y, m });
    setOpenDay(null);
  };

  const monthLabel = `${MONTHS_TH[cursor.m - 1]} ${cursor.y + 543}`;
  const instById = useMemo(
    () => new Map((data?.instructors ?? []).map((i) => [i.id, i])),
    [data],
  );
  const dayInitials = (s: CalSlot) =>
    `${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase();

  // Build the calendar grid as full weeks (leading/trailing blanks for alignment).
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedSlots = openDay ? days[openDay] ?? [] : [];

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-cyan-50/50 to-background dark:from-primary/20 dark:via-cyan-900/20 dark:to-background py-10 px-4">
        <div className="max-w-5xl mx-auto relative z-10 text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-600">
            ปฏิทินครูฝึก
          </h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <CalendarCheck className="w-4 h-4 text-cyan-500" />
            ดูว่าครูฝึกคนไหนลงสอนวันไหนในแต่ละเดือน
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 space-y-6 -mt-2">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => goMonth(-1)} aria-label="เดือนก่อนหน้า">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-[10rem] text-center font-bold text-lg flex items-center justify-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {monthLabel}
            </div>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => goMonth(1)} aria-label="เดือนถัดไป">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={goToday}>
              วันนี้
            </Button>
          </div>

          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="ครูฝึกทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ครูฝึกทั้งหมด</SelectItem>
              {(data?.instructors ?? []).map((inst) => (
                <SelectItem key={inst.id} value={String(inst.id)}>
                  {inst.firstName} {inst.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Calendar grid */}
        <Card className="overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
              {DOW_SHORT.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "text-center text-xs font-bold py-1 text-muted-foreground",
                    (i === 0 || i === 6) && "text-rose-400",
                  )}
                >
                  {d}
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`b${idx}`} className="aspect-square" />;
                  const dateStr = `${monthStr}-${pad(day)}`;
                  const slots = days[dateStr] ?? [];
                  const teacherIds = [...new Set(slots.map((s) => s.instructorId))];
                  const isToday = dateStr === todayStr;
                  const hasSlots = slots.length > 0;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => hasSlots && setOpenDay(dateStr)}
                      disabled={!hasSlots}
                      className={cn(
                        "aspect-square rounded-lg border p-1 flex flex-col items-stretch text-left transition-all",
                        isToday ? "border-primary ring-1 ring-primary" : "border-border",
                        hasSlots
                          ? "hover:shadow-md hover:border-primary/60 cursor-pointer bg-card"
                          : "bg-muted/30 cursor-default",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-semibold leading-none px-0.5",
                          isToday ? "text-primary" : "text-foreground",
                        )}
                      >
                        {day}
                      </span>
                      {hasSlots && (
                        <div className="mt-auto flex flex-wrap gap-0.5 justify-start">
                          {teacherIds.slice(0, 4).map((id) => (
                            <span
                              key={id}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: colorById.get(id) ?? "#0ea5e9" }}
                            />
                          ))}
                          {teacherIds.length > 4 && (
                            <span className="text-[9px] leading-none text-muted-foreground">+{teacherIds.length - 4}</span>
                          )}
                        </div>
                      )}
                      {hasSlots && (
                        <span className="hidden sm:block text-[9px] text-muted-foreground leading-none mt-0.5">
                          {teacherIds.length} ครู · {slots.length} รอบ
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            {!isLoading && (data?.instructors?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-4 pt-3 border-t">
                {(data?.instructors ?? []).map((inst) => (
                  <span key={inst.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorById.get(inst.id) }} />
                    {inst.firstName} {inst.lastName}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              จำนวนรอบสอนรายวัน — {monthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalSlots === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>เดือนนี้ยังไม่มีครูฝึกลงตารางสอน</p>
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: -24, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      labelFormatter={(d) => `วันที่ ${d}`}
                      formatter={(value: number, name) => [value, name === "sessions" ? "รอบสอน" : "ครูฝึก"]}
                    />
                    <Bar dataKey="sessions" name="sessions" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly summary table */}
        {summary.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                สรุปครูฝึกประจำเดือน
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left font-medium px-4 py-2">ครูฝึก</th>
                      <th className="text-left font-medium px-4 py-2 hidden sm:table-cell">ความเชี่ยวชาญ</th>
                      <th className="text-right font-medium px-4 py-2">วันที่ลงสอน</th>
                      <th className="text-right font-medium px-4 py-2">รอบสอน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((r) => (
                      <tr key={r.inst.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-2 font-medium">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorById.get(r.inst.id) }} />
                            {r.inst.firstName} {r.inst.lastName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                          {r.inst.specialty || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">{r.days}</td>
                        <td className="px-4 py-2.5 text-right">{r.slots}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Day detail dialog */}
      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {openDay &&
                new Date(`${openDay}T00:00:00`).toLocaleDateString("th-TH", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">ไม่มีครูฝึกลงสอนในวันนี้</p>
            ) : (
              selectedSlots.map((s, i) => {
                const inst = instById.get(s.instructorId);
                return (
                  <div key={`${s.instructorId}-${s.startTime}-${i}`} className="flex items-center gap-3 rounded-xl border p-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
                      style={{ backgroundColor: colorById.get(s.instructorId) ?? "#0ea5e9" }}
                    >
                      {inst?.profileImageUrl ? (
                        <img src={inst.profileImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        dayInitials(s)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {s.startTime}–{s.endTime}
                        {s.specialty && <span className="truncate">· {s.specialty}</span>}
                      </p>
                      {s.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{s.note}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {s.packageName && (
                        <Badge variant="outline" className="text-[10px]">{s.packageName}</Badge>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">รับ {s.maxPeople} คน</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Button asChild className="w-full mt-2 rounded-full">
            <a href={`${baseUrl}/book`}>ไปจองคลาส</a>
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};
