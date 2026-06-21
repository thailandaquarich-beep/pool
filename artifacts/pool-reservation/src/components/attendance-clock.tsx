import { FC, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Clock, Timer, CalendarDays } from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

export const fmtMins = (m: number, th: boolean) => {
  const h = Math.floor((m || 0) / 60), mm = (m || 0) % 60;
  return th ? `${h} ชม. ${mm} น.` : `${h}h ${mm}m`;
};
export const fmtTime = (iso: string | null, th: boolean) =>
  iso ? new Date(iso).toLocaleTimeString(th ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDate = (iso: string, th: boolean) =>
  new Date(iso).toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

type MeData = {
  current: { id: number; clockIn: string } | null;
  history: any[];
  todayMinutes: number;
  monthMinutes: number;
};

/** Reusable clock-in/out card for staff (used on both the staff and admin pages). */
export const AttendanceClock: FC = () => {
  const { language } = useTranslation();
  const th = language === "th";
  const qc = useQueryClient();
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery<MeData | null>({
    queryKey: ["attendance", "me"],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/attendance/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      return r.json();
    },
  });

  const onDuty = !!data?.current;
  const act = async (path: "clock-in" | "clock-out") => {
    setBusy(true);
    try {
      const r = await fetch(`${baseUrl}/api/attendance/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 403 here usually means a stale login from before the "staff" role existed.
        const msg = r.status === 401 || r.status === 403
          ? (th ? "บัญชีนี้ไม่มีสิทธิ์ลงเวลา หรือเซสชันหมดอายุ — กรุณาออกจากระบบแล้วเข้าใหม่" : "Not allowed / session expired — please log out and back in")
          : (d.message || d.error || (th ? "ลงเวลาไม่สำเร็จ" : "Failed"));
        throw new Error(msg);
      }
      await qc.invalidateQueries({ queryKey: ["attendance"] });
      toast({ title: path === "clock-in" ? (th ? "ลงเวลาเข้างานแล้ว ✅" : "Clocked in ✅") : (th ? "ลงเวลาออกงานแล้ว ✅" : "Clocked out ✅") });
    } catch (e: any) {
      toast({ title: e?.message || (th ? "ลงเวลาไม่สำเร็จ" : "Failed"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className={`relative rounded-3xl overflow-hidden p-6 sm:p-7 text-white sheen shadow-2xl ${onDuty ? "bg-brand-rich bg-brand-animated shadow-primary/30 ring-1 ring-[hsl(var(--gold)/0.4)]" : "bg-gradient-to-br from-slate-600 to-slate-800 shadow-black/20"}`}>
      <div className="pointer-events-none absolute -top-10 -right-8 w-40 h-40 rounded-full bg-[hsl(var(--gold)/0.35)] blur-3xl" />
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-medium text-white/85">
            <span className={`w-2.5 h-2.5 rounded-full ${onDuty ? "bg-emerald-300 animate-pulse" : "bg-white/40"}`} />
            {onDuty ? (th ? "กำลังปฏิบัติงาน" : "On duty") : (th ? "ยังไม่ได้ลงเวลา" : "Off duty")}
          </div>
          <div className="mt-1 text-3xl font-display font-extrabold drop-shadow">
            {onDuty ? (th ? "เข้างานเมื่อ " : "Since ") + fmtTime(data!.current!.clockIn, th) : (th ? "ลงเวลาเข้างาน" : "Clock in to start")}
          </div>
          <div className="mt-3 flex gap-5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-white/85"><Timer className="w-4 h-4 text-[hsl(var(--gold-soft))]" /> {th ? "วันนี้" : "Today"}: <b>{fmtMins(data?.todayMinutes || 0, th)}</b></span>
            <span className="inline-flex items-center gap-1.5 text-white/85"><CalendarDays className="w-4 h-4 text-[hsl(var(--gold-soft))]" /> {th ? "เดือนนี้" : "Month"}: <b>{fmtMins(data?.monthMinutes || 0, th)}</b></span>
          </div>
        </div>
        <div className="shrink-0">
          {onDuty ? (
            <Button onClick={() => act("clock-out")} disabled={busy} size="lg" className="h-14 px-7 rounded-2xl text-base font-bold bg-white text-slate-800 hover:bg-white/90 shadow-xl gap-2">
              <LogOut className="w-5 h-5" /> {busy ? "..." : (th ? "ลงเวลาออกงาน" : "Clock out")}
            </Button>
          ) : (
            <Button onClick={() => act("clock-in")} disabled={busy} size="lg" className="h-14 px-7 rounded-2xl text-base font-bold bg-gold shadow-xl glow-gold gap-2">
              <LogIn className="w-5 h-5" /> {busy ? "..." : (th ? "ลงเวลาเข้างาน" : "Clock in")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Compact icon header reused by attendance pages. */
export const ClockHeaderIcon: FC = () => (
  <div className="w-11 h-11 rounded-2xl icon-tile bg-gold flex items-center justify-center"><Clock className="w-6 h-6" /></div>
);
