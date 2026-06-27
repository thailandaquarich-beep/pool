import { FC, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AttendanceClock, ClockHeaderIcon, fmtMins, fmtTime, fmtDate } from "@/components/attendance-clock";
import { Users, BarChart3, Trash2, Radio, Download, Search } from "lucide-react";
import { downloadCsv, csvStamp } from "@/lib/export-csv";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const todayLocal = () => new Date().toLocaleDateString("en-CA");

type User = { id: number; firstName: string; lastName: string; role: string; profileImageUrl: string | null };
type Rec = { id: number; workDate: string; clockIn: string; clockOut: string | null; workedMinutes: number | null; method: string; user: User };
type Summary = { user: User; totalMinutes: number; shifts: number };

const roleLabel = (role: string, th: boolean) =>
  role === "instructor" ? (th ? "ครูฝึก" : "Instructor") : role === "super_admin" ? "Super Admin" : (th ? "แอดมิน" : "Admin");
const initials = (u: User) => `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase();

const Avatar: FC<{ u: User }> = ({ u }) => (
  u.profileImageUrl
    ? <img src={u.profileImageUrl} alt="" className="w-9 h-9 rounded-xl object-cover ring-1 ring-border" />
    : <div className="w-9 h-9 rounded-xl icon-tile bg-brand flex items-center justify-center text-xs font-bold">{initials(u)}</div>
);

/** Admin oversight: own clock + who's on duty now + per-employee hour report. */
export const AdminAttendance: FC = () => {
  const { language } = useTranslation();
  const th = language === "th";
  const token = localStorage.getItem("pool_token");
  const qc = useQueryClient();
  const auth = { Authorization: `Bearer ${token}` };

  const [from, setFrom] = useState(todayLocal().slice(0, 7) + "-01");
  const [to, setTo] = useState(todayLocal());
  const [staffSearch, setStaffSearch] = useState("");

  const { data: onDuty } = useQuery<Rec[]>({
    queryKey: ["attendance", "on-duty"],
    refetchInterval: 20000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/attendance/on-duty`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const { data: report } = useQuery<{ records: Rec[]; summary: Summary[] } | null>({
    queryKey: ["attendance", "report", from, to],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/attendance/report?from=${from}&to=${to}`, { headers: auth });
      return r.ok ? r.json() : null;
    },
  });

  const del = async (id: number) => {
    if (!confirm(th ? "ลบรายการนี้?" : "Delete this record?")) return;
    await fetch(`${baseUrl}/api/attendance/${id}`, { method: "DELETE", headers: auth });
    qc.invalidateQueries({ queryKey: ["attendance"] });
  };
  const q = staffSearch.trim().toLowerCase();
  const summary = (report?.summary || []).filter((s) =>
    `${s.user.firstName} ${s.user.lastName} ${s.user.role}`.toLowerCase().includes(q),
  );
  const records = (report?.records || []).filter((r) =>
    `${r.user.firstName} ${r.user.lastName} ${r.user.role}`.toLowerCase().includes(q),
  );

  const exportAttendance = () => {
    const rows = [
      ["ชื่อพนักงาน", "บทบาท", "วันที่", "เข้า", "ออก", "นาที", "ชั่วโมง", "วิธี"],
      ...records.map((r) => [
        `${r.user.firstName} ${r.user.lastName}`,
        roleLabel(r.user.role, th),
        r.workDate,
        fmtTime(r.clockIn, th),
        r.clockOut ? fmtTime(r.clockOut, th) : "",
        r.workedMinutes ?? "",
        r.workedMinutes != null ? (r.workedMinutes / 60).toFixed(2) : "",
        r.method,
      ]),
    ];
    downloadCsv(`attendance-${from}-to-${to}-${csvStamp()}.csv`, rows);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <ClockHeaderIcon />
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight">{th ? "ลงเวลา / กะพนักงาน" : "Staff attendance"}</h1>
          <p className="text-sm text-muted-foreground">{th ? "ลงเวลาของคุณ ดูคนที่กำลังทำงาน และรายงานชั่วโมงพนักงาน" : "Your clock, who's on duty, and staff hour reports"}</p>
        </div>
      </div>

      <AttendanceClock />

      {/* On duty now */}
      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-border/60 font-display font-bold flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-500" /> {th ? "กำลังปฏิบัติงานตอนนี้" : "On duty now"}
            <span className="ml-1 text-sm text-muted-foreground">({onDuty?.length || 0})</span>
          </div>
          {!onDuty || onDuty.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">{th ? "ยังไม่มีใครลงเวลาเข้างาน" : "Nobody is on duty"}</div>
          ) : (
            <div className="divide-y divide-border/50">
              {onDuty.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <Avatar u={r.user} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.user.firstName} {r.user.lastName}</div>
                    <div className="text-xs text-muted-foreground">{roleLabel(r.user.role, th)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{th ? "เข้างาน " : "since "}{fmtTime(r.clockIn, th)}</div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report */}
      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
            <div className="font-display font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gold" /> {th ? "รายงานชั่วโมงทำงาน" : "Hours report"}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder={th ? "ค้นหาชื่อพนักงาน" : "Search staff"} className="h-9 w-[180px] rounded-lg pl-8" />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto rounded-lg" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto rounded-lg" />
              <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={exportAttendance} disabled={!records.length}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
          </div>

          {/* per-employee summary */}
          <div className="px-5 py-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {th ? "สรุปรายคน" : "Per employee"}</div>
            {!report || summary.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{th ? "ไม่มีข้อมูลในช่วงนี้" : "No data in this range"}</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {summary.map((s) => (
                  <div key={s.user.id} className="flex items-center gap-3 rounded-xl bg-brand-soft ring-1 ring-primary/10 px-3 py-2.5">
                    <Avatar u={s.user} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{s.user.firstName} {s.user.lastName}</div>
                      <div className="text-xs text-muted-foreground">{roleLabel(s.user.role, th)} · {s.shifts} {th ? "กะ" : "shifts"}</div>
                    </div>
                    <div className="font-display font-bold text-gradient-gold">{fmtMins(s.totalMinutes, th)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* records */}
          {report && records.length > 0 && (
            <div className="border-t border-border/60">
              <div className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground">{th ? "รายการทั้งหมด" : "All records"}</div>
              <div className="divide-y divide-border/50">
                {records.map((r) => (
                  <div key={r.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                    <Avatar u={r.user} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.user.firstName} {r.user.lastName}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(r.clockIn, th)} · {fmtTime(r.clockIn, th)}–{r.clockOut ? fmtTime(r.clockOut, th) : (th ? "ทำงานอยู่" : "ongoing")}
                        {r.method === "manual" && <span className="ml-1.5 text-[10px] text-[hsl(var(--gold-deep))]">({th ? "บันทึกเอง" : "manual"})</span>}
                      </div>
                    </div>
                    <div className="font-display font-bold text-sm">{r.workedMinutes != null ? fmtMins(r.workedMinutes, th) : "—"}</div>
                    <button onClick={() => del(r.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={th ? "ลบ" : "Delete"}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
