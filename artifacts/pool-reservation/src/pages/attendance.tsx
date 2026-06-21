import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceClock, ClockHeaderIcon, fmtMins, fmtTime, fmtDate } from "@/components/attendance-clock";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

type Row = { id: number; workDate: string; clockIn: string; clockOut: string | null; workedMinutes: number | null; method: string };

/** Staff (instructor + admin) self-service: clock in/out + personal history. */
export const Attendance: FC = () => {
  const { language } = useTranslation();
  const th = language === "th";
  const token = localStorage.getItem("pool_token");

  const { data } = useQuery<{ history: Row[] } | null>({
    queryKey: ["attendance", "me"],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/attendance/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      return r.json();
    },
  });
  const history = data?.history || [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <ClockHeaderIcon />
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight">{th ? "ลงเวลางาน" : "Attendance"}</h1>
          <p className="text-sm text-muted-foreground">{th ? "ลงเวลาเข้า-ออกงานและดูประวัติการทำงานของคุณ" : "Clock in/out and review your work history"}</p>
        </div>
      </div>

      <AttendanceClock />

      <Card className="glass rounded-2xl border-none shadow-lg">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-border/60 font-display font-bold">{th ? "ประวัติล่าสุด" : "Recent history"}</div>
          {history.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">{th ? "ยังไม่มีประวัติการลงเวลา" : "No attendance yet"}</div>
          ) : (
            <div className="divide-y divide-border/50">
              {history.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{fmtDate(r.clockIn, th)}</div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      {fmtTime(r.clockIn, th)} – {r.clockOut ? fmtTime(r.clockOut, th) : (th ? "กำลังทำงาน" : "ongoing")}
                      {r.method === "manual" && <span className="ml-2 rounded-full bg-gold-soft text-[hsl(var(--gold-deep))] px-1.5 py-0.5 text-[10px] font-semibold">{th ? "บันทึกโดยแอดมิน" : "manual"}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 font-display font-bold text-gradient-gold">
                    {r.workedMinutes != null ? fmtMins(r.workedMinutes, th) : "—"}
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
