import { FC, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { GraduationCap, Clock, Award, Sparkles, Users, CalendarCheck, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type Instructor = {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  specialty: string | null;
  certification: string | null;
  experience: string | null;
  biography: string | null;
  profileImageUrl: string | null;
  status: "active" | "on_leave" | "inactive";
};

type Avail = { id: number; kind: "weekly" | "date"; dayOfWeek: number | null; date: string | null; startTime: string; endTime: string; note: string | null };
const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

type TodaySession = { startTime: string; endTime: string; numberOfPeople: number };
type TodayInstructor = Instructor & {
  sessions: TodaySession[];
  sessionCount: number;
  totalPeople: number;
};

const initials = (i: { firstName: string; lastName: string }) =>
  `${i.firstName?.[0] ?? ""}${i.lastName?.[0] ?? ""}`.toUpperCase();

const Avatar: FC<{ instructor: Instructor; size?: "sm" | "lg" }> = ({ instructor, size = "sm" }) => (
  <div
    className={cn(
      "rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center overflow-hidden border-4 border-white dark:border-slate-800 shadow-sm shrink-0",
      size === "lg" ? "w-24 h-24 text-3xl" : "w-16 h-16 text-xl",
    )}
  >
    {instructor.profileImageUrl ? (
      <img src={instructor.profileImageUrl} alt="" className="w-full h-full object-cover" />
    ) : (
      initials(instructor)
    )}
  </div>
);

export const MemberInstructors: FC = () => {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const todayLabel = format(new Date(), "EEEE d MMMM yyyy", { locale: th });

  const [selected, setSelected] = useState<Instructor | null>(null);
  const [avail, setAvail] = useState<Avail[]>([]);

  useEffect(() => {
    if (!selected) { setAvail([]); return; }
    let alive = true;
    fetch(`${baseUrl}/api/instructors/${selected.id}/availability`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setAvail(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [selected]);

  const { data: today, isLoading: todayLoading } = useQuery<{ date: string; instructors: TodayInstructor[] }>({
    queryKey: ["instructors", "today"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/instructors/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { date: "", instructors: [] };
      return res.json();
    },
  });

  const { data: all, isLoading: allLoading } = useQuery<Instructor[]>({
    queryKey: ["instructors", "active"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/instructors?status=active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const teachingToday = today?.instructors ?? [];

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-cyan-50/50 to-background dark:from-primary/20 dark:via-cyan-900/20 dark:to-background py-12 px-4">
        <div className="max-w-5xl mx-auto relative z-10 text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-600">
            ครูฝึกของเรา
          </h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-500" />
            ทีมผู้ฝึกสอนมืออาชีพของ Aquarich
          </p>
        </div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-cyan-200/20 dark:bg-cyan-900/20 blur-3xl" />
          <div className="absolute top-[10%] -right-[10%] w-[45%] h-[45%] rounded-full bg-blue-200/20 dark:bg-blue-900/20 blur-3xl" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 space-y-12 -mt-4">
        {/* Teaching today */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <CalendarCheck className="w-6 h-6 text-primary" />
              ครูฝึกที่ลงสอนวันนี้
            </h2>
            <span className="text-sm text-muted-foreground capitalize">{todayLabel}</span>
          </div>

          {todayLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}
            </div>
          ) : teachingToday.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>วันนี้ยังไม่มีครูฝึกลงตารางสอน</p>
                <p className="text-sm mt-1">เมื่อมีสมาชิกจองพร้อมเลือกครูฝึก รายชื่อจะปรากฏที่นี่</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {teachingToday.map((inst) => (
                <Card
                  key={inst.id}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ring-1 ring-primary/10"
                  onClick={() => setSelected(inst)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <Avatar instructor={inst} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg truncate">{inst.firstName} {inst.lastName}</h3>
                          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px]">ลงสอนวันนี้</Badge>
                        </div>
                        {inst.specialty && <p className="text-sm text-muted-foreground truncate">{inst.specialty}</p>}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {inst.sessionCount} รอบ · รวม {inst.totalPeople} คน
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {inst.sessions.map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold"
                        >
                          <Clock className="w-3 h-3" /> {s.startTime}–{s.endTime}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* All instructors */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            ครูฝึกทั้งหมด
          </h2>

          {allLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-56 rounded-2xl bg-muted animate-pulse" />)}
            </div>
          ) : !all?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>ยังไม่มีข้อมูลครูฝึก</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {all.map((inst) => (
                <Card
                  key={inst.id}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelected(inst)}
                >
                  <CardContent className="p-0">
                    <div className="bg-gradient-to-br from-primary/5 to-cyan-50/50 dark:from-primary/10 dark:to-cyan-900/20 p-6 flex flex-col items-center text-center">
                      <Avatar instructor={inst} size="lg" />
                      <h3 className="font-bold text-lg mt-4">{inst.firstName} {inst.lastName}</h3>
                      {inst.specialty && (
                        <Badge variant="outline" className="mt-2 text-xs">{inst.specialty}</Badge>
                      )}
                      {inst.experience && (
                        <p className="text-xs text-muted-foreground mt-2">ประสบการณ์ {inst.experience}</p>
                      )}
                    </div>
                    {inst.certification && (
                      <div className="p-4 border-t flex items-center gap-2 text-sm text-muted-foreground">
                        <Award className="w-4 h-4 shrink-0 text-amber-500" />
                        <span className="truncate">{inst.certification}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Profile detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="sr-only">โปรไฟล์ครูฝึก</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center text-center -mt-2">
                <Avatar instructor={selected} size="lg" />
                <h3 className="font-bold text-xl mt-4">{selected.firstName} {selected.lastName}</h3>
                {selected.specialty && <Badge variant="outline" className="mt-2">{selected.specialty}</Badge>}
              </div>
              <div className="space-y-3 mt-4 text-sm">
                {selected.experience && (
                  <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary shrink-0" /> ประสบการณ์ {selected.experience}</div>
                )}
                {selected.certification && (
                  <div className="flex items-center gap-2"><Award className="w-4 h-4 text-amber-500 shrink-0" /> {selected.certification}</div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4 shrink-0" /> {selected.phone}</div>
                )}
                {selected.email && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4 shrink-0" /> {selected.email}</div>
                )}
                {selected.biography && (
                  <p className="text-muted-foreground leading-relaxed pt-2 border-t">{selected.biography}</p>
                )}
              </div>

              {/* Instructor availability schedule (display only) */}
              {avail.length > 0 && (
                <div className="pt-3 mt-3 border-t">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /> ตารางเวลาว่างสอน</p>
                  <div className="space-y-1.5">
                    {avail.filter((a) => a.kind === "weekly").sort((a, b) => a.dayOfWeek! - b.dayOfWeek!).map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary" className="w-16 justify-center shrink-0">{DOW[a.dayOfWeek!]}</Badge>
                        <span className="text-muted-foreground">{a.startTime}–{a.endTime}</span>
                        {a.note && <span className="text-xs text-muted-foreground truncate">· {a.note}</span>}
                      </div>
                    ))}
                    {avail.filter((a) => a.kind === "date").map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="justify-center shrink-0">{new Date(a.date! + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</Badge>
                        <span className="text-muted-foreground">{a.startTime}–{a.endTime}</span>
                        {a.note && <span className="text-xs text-muted-foreground truncate">· {a.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button className="w-full mt-4 rounded-full" onClick={() => setSelected(null)}>ปิด</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
