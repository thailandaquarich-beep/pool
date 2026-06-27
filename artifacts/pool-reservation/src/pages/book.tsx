import { type ComponentProps, FC, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAvailableSlots, getGetAvailableSlotsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { DayButton } from "react-day-picker";
import { CheckCircle2, Clock, Users, CalendarIcon, Waves, Minus, Plus, Loader2, GraduationCap, Check, Ticket, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type ActiveInstructor = {
  id: number;
  firstName: string;
  lastName: string;
  specialty: string | null;
  experience: string | null;
  profileImageUrl: string | null;
};

type TeachingSlot = {
  id: number;
  startTime: string;
  endTime: string;
  note: string | null;
  bookedPeople: number;
  maxPeople: number;
  remainingPeople: number;
};

type TeachingInstructor = ActiveInstructor & {
  slots: TeachingSlot[];
};

// Modern day cell for the booking calendar (react-day-picker v9 `DayButton` override).
// Gives the selected day a gradient + glow, highlights "today" with a ring, and
// dims past/disabled days — keeping the grid large and easy to scan.
const ModernDay = ({ modifiers, className, ...props }: ComponentProps<typeof DayButton>) => {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const { selected, today, outside, disabled } = modifiers;

  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        "relative flex aspect-square w-full select-none items-center justify-center rounded-2xl text-base font-medium transition-all duration-200",
        "hover:bg-primary/10 hover:scale-[1.08]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:z-10",
        outside && "text-muted-foreground/40",
        today && !selected && "font-extrabold text-primary ring-2 ring-inset ring-primary/40",
        selected &&
          "scale-[1.06] bg-gradient-to-br from-primary to-cyan-500 font-bold text-white shadow-lg shadow-primary/30 hover:scale-[1.08] hover:from-primary hover:to-cyan-500",
        disabled &&
          "cursor-not-allowed text-muted-foreground/30 opacity-40 hover:scale-100 hover:bg-transparent",
        className,
      )}
    />
  );
};

// Removed useTranslation as requested to hardcode Thai strings per spec
// (Actually the prompt says: "All Thai text for labels..." but I'll use it directly to keep it simple, or I'll just use Thai text directly as required)

export const Book: FC = () => {
  const [, setLocation] = useLocation();
  
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [people, setPeople] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [instructorId, setInstructorId] = useState<number | null>(null);
  const [memberPackageId, setMemberPackageId] = useState<number | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [bookingPending, setBookingPending] = useState(true);

  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const qc = useQueryClient();
  const { toast } = useToast();

  const slotSectionRef = useRef<HTMLDivElement>(null);
  const instructorSectionRef = useRef<HTMLDivElement>(null);
  const confirmSectionRef = useRef<HTMLDivElement>(null);

  const formattedDate = date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  const { data: slots, isLoading } = useGetAvailableSlots(
    { date: formattedDate },
    { query: { queryKey: getGetAvailableSlotsQueryKey({ date: formattedDate }) } }
  );
  const selectedSlotData = slots?.find(s => s.startTime === selectedSlot);

  // Instructors who published teaching time on the selected date.
  const { data: teachingInstructors, isLoading: instructorsLoading } = useQuery<TeachingInstructor[]>({
    queryKey: ["instructors", "teaching", formattedDate],
    queryFn: async () => {
      const params = new URLSearchParams({ date: formattedDate });
      const res = await fetch(`${baseUrl}/api/instructors/teaching?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!date,
  });

  const selectedInstructor = teachingInstructors?.find((i) => i.id === instructorId) ?? null;

  const teachingSlotForPoolSlot = (startTime?: string | null, endTime?: string | null) => {
    if (!selectedInstructor || !startTime || !endTime) return null;
    return selectedInstructor.slots.find((slot) => slot.startTime <= startTime && slot.endTime >= endTime) ?? null;
  };
  const selectedTeacherSlot = teachingSlotForPoolSlot(selectedSlotData?.startTime, selectedSlotData?.endTime);

  useEffect(() => {
    setInstructorId(null);
    setSelectedSlot(null);
  }, [formattedDate]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [instructorId]);

  const createReservation = useMutation({
    mutationFn: async (data: {
      date: string;
      startTime: string;
      endTime: string;
      numberOfPeople: number;
      notes?: string;
      instructorId?: number | null;
      memberPackageId: number;
    }) => {
      const res = await fetch(`${baseUrl}/api/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to create reservation");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setBookingPending(data?.status !== "confirmed");
      setIsSuccess(true);
      qc.invalidateQueries({ queryKey: getGetAvailableSlotsQueryKey({ date: formattedDate }) });
      qc.invalidateQueries({ queryKey: ["packages", "my-usage"] });
    },
    onError: (err: any) => {
      toast({ title: "จองไม่สำเร็จ", description: err?.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  // Booking consumes 1 "use" from the member's active package (not money).
  const { data: usage } = useQuery<{
    hasQuota: boolean;
    hasActivePackage: boolean;
    totalRemaining: number | null;
    packages: Array<{
      memberPackageId: number;
      packageId: number;
      name: string;
      endDate: string;
      quota: number | null;
      used: number;
      remaining: number | null;
    }>;
  }>({
    queryKey: ["packages", "my-usage"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/packages/my-usage`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { hasQuota: false, hasActivePackage: false, totalRemaining: 0 };
      return res.json();
    },
  });

  const remaining = usage?.totalRemaining ?? null; // null = unlimited
  const hasQuota = usage?.hasQuota ?? false;
  const hasActivePackage = usage?.hasActivePackage ?? false;
  const usablePackages = (usage?.packages ?? []).filter((pkg) => pkg.remaining === null || pkg.remaining > 0);
  const selectedPackage = usablePackages.find((pkg) => pkg.memberPackageId === memberPackageId) ?? null;

  useEffect(() => {
    if (!memberPackageId && usablePackages.length > 0) {
      setMemberPackageId(usablePackages[0].memberPackageId);
    }
    if (memberPackageId && usablePackages.length > 0 && !usablePackages.some((pkg) => pkg.memberPackageId === memberPackageId)) {
      setMemberPackageId(usablePackages[0].memberPackageId);
    }
  }, [memberPackageId, usablePackages]);

  // Scroll to slot section when date is selected
  useEffect(() => {
    if (date && instructorSectionRef.current && !instructorId && !isSuccess) {
      setTimeout(() => {
        instructorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [date, instructorId, isSuccess]);

  useEffect(() => {
    if (instructorId && slotSectionRef.current && !selectedSlot && !isSuccess) {
      setTimeout(() => {
        slotSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [instructorId, selectedSlot, isSuccess]);

  // Scroll to confirm section when slot is selected
  useEffect(() => {
    if (selectedSlot && confirmSectionRef.current && !isSuccess) {
      setTimeout(() => {
        confirmSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedSlot, isSuccess]);

  // Auto redirect after success
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        setLocation("/reservations");
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSuccess, setLocation]);

  const handleBook = () => {
    if (!selectedSlot || !date) return;
    if (!instructorId || !selectedInstructor) {
      toast({ title: "กรุณาเลือกครูฝึกก่อนจอง", variant: "destructive" });
      return;
    }
    
    const slot = slots?.find(s => s.startTime === selectedSlot);
    if (!slot) return;
    const teacherSlot = teachingSlotForPoolSlot(slot.startTime, slot.endTime);
    if (!teacherSlot) {
      toast({ title: "ครูฝึกไม่ได้ลงเวลาสอนในรอบนี้", variant: "destructive" });
      return;
    }
    if (people > teacherSlot.remainingPeople) {
      toast({
        title: "จำนวนผู้เรียนเกินที่ครูรับได้",
        description: `ครูฝึกรับได้อีก ${teacherSlot.remainingPeople} คนในช่วงเวลานี้`,
        variant: "destructive",
      });
      return;
    }
    if (!memberPackageId || !selectedPackage) {
      toast({ title: "กรุณาเลือกแพ็กเกจที่จะใช้จอง", variant: "destructive" });
      return;
    }

    createReservation.mutate({
      date: formattedDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      numberOfPeople: people,
      notes: notes || undefined,
      instructorId,
      memberPackageId,
    });
  };

  const step = isSuccess ? 4 : selectedSlot ? 4 : instructorId ? 3 : date ? 2 : 1;

  if (isSuccess) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-emerald-950 dark:text-emerald-400">
          {bookingPending ? "ส่งคำขอจองแล้ว!" : "จองสำเร็จแล้ว!"}
        </h1>

        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm",
          bookingPending ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        )}>
          {bookingPending
            ? <><Clock className="w-4 h-4" /> รอแอดมินยืนยัน — จะหัก 1 ครั้งเมื่อได้รับการยืนยัน</>
            : <><CheckCircle2 className="w-4 h-4" /> ยืนยันแล้ว · หักสิทธิ์ 1 ครั้ง</>}
        </div>

        {selectedInstructor && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium">
            <GraduationCap className="w-4 h-4" />
            ครูฝึก: {selectedInstructor.firstName} {selectedInstructor.lastName}
          </div>
        )}

        <div className="flex gap-4 w-full max-w-md">
          <Card className="flex-1 bg-white/50 backdrop-blur-sm border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
              <CalendarIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm font-medium">
                {date && format(date, "d MMM yyyy", { locale: th })}
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 bg-white/50 backdrop-blur-sm border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
              <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm font-medium">
                {selectedSlotData?.startTime} - {selectedSlotData?.endTime}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4">
          <Button onClick={() => setLocation("/reservations")} variant="outline" size="lg" className="rounded-full">
            ดูการจองของฉัน
          </Button>
          <Button onClick={() => {
            setIsSuccess(false);
            setDate(undefined);
            setSelectedSlot(null);
            setPeople(1);
            setNotes("");
            setInstructorId(null);
          }} size="lg" className="rounded-full bg-emerald-600 hover:bg-emerald-700">
            จองอีกครั้ง
          </Button>
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">กำลังพากลับไปหน้าการจองใน 5 วินาที...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 font-sans">
      {/* Wavy/gradient header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-cyan-50/50 to-background dark:from-primary/20 dark:via-cyan-900/20 dark:to-background py-16 px-4">
        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          {/* Step Indicator */}
          <div className="flex items-center justify-center space-x-2 sm:space-x-4 text-xs sm:text-sm font-medium text-muted-foreground">
            <span className={cn("transition-colors", step >= 1 ? "text-primary" : "")}>1 เลือกวัน</span>
            <span>&gt;</span>
            <span className={cn("transition-colors", step >= 2 ? "text-primary" : "")}>2 เลือกครู</span>
            <span>&gt;</span>
            <span className={cn("transition-colors", step >= 3 ? "text-primary" : "")}>3 เลือกเวลา</span>
            <span>&gt;</span>
            <span className={cn("transition-colors", step >= 4 ? "text-primary" : "")}>4 ยืนยัน</span>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold tracking-tight text-gradient">
              จองสระว่ายน้ำ
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground flex items-center justify-center gap-2">
              <Waves className="w-5 h-5 text-cyan-500" />
              เลือกวันที่ต้องการ
              <Waves className="w-5 h-5 text-cyan-500" />
            </p>
          </div>
        </div>
        
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-cyan-200/20 dark:bg-cyan-900/20 blur-3xl mix-blend-multiply" />
          <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-200/20 dark:bg-blue-900/20 blur-3xl mix-blend-multiply" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-12 -mt-8 relative z-20">
        {/* STEP 1: SELECT DATE */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-xl overflow-hidden rounded-3xl">
          <CardContent className="p-6 md:p-8 flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" />
                เลือกวัน
              </h2>
              {date && (
                <div className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium animate-in fade-in slide-in-from-right-4">
                  เลือกแล้ว: {format(date, "d MMM yyyy", { locale: th })}
                </div>
              )}
            </div>
            
            <div className="w-full max-w-md mx-auto p-3 sm:p-5 rounded-3xl bg-gradient-to-b from-white to-slate-50/60 dark:from-zinc-900 dark:to-zinc-950 border border-border/60 shadow-sm">
              <Calendar
                mode="single"
                locale={th}
                showOutsideDays
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setSelectedSlot(null);
                  }
                }}
                disabled={(d) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return d < today;
                }}
                className="pointer-events-auto w-full [--cell-size:2.6rem] sm:[--cell-size:3.1rem]"
                classNames={{
                  months: "w-full",
                  month: "w-full space-y-3",
                  month_caption: "flex h-12 items-center justify-center text-lg font-bold capitalize text-foreground",
                  nav: "absolute inset-x-0 top-0 flex items-center justify-between px-0.5",
                  button_previous:
                    "h-10 w-10 rounded-full bg-secondary/70 text-foreground hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors p-0",
                  button_next:
                    "h-10 w-10 rounded-full bg-secondary/70 text-foreground hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors p-0",
                  weekdays: "flex w-full mb-1",
                  weekday: "flex-1 text-center text-xs sm:text-sm font-bold uppercase tracking-wide text-muted-foreground/70",
                  week: "flex w-full mt-1.5",
                  day: "flex-1 p-0.5 text-center",
                }}
                components={{ DayButton: ModernDay }}
              />
            </div>
          </CardContent>
        </Card>

        {/* STEP 2: SELECT INSTRUCTOR */}
        <div ref={instructorSectionRef} className={cn("transition-all duration-700 space-y-6", date ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none hidden")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-primary" />
                เลือกครูฝึกก่อนจอง
              </h2>
              <p className="text-sm text-muted-foreground">สมาชิกต้องเลือกครูฝึก แล้วระบบจะแสดงเฉพาะเวลาที่ครูคนนั้นลงสอน</p>
            </div>
            {date && <span className="text-sm text-muted-foreground">{format(date, "d MMM yyyy", { locale: th })}</span>}
          </div>

          {instructorsLoading ? (
            <div className="flex items-center justify-center p-10 rounded-3xl border bg-card/80">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : teachingInstructors && teachingInstructors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teachingInstructors.map((inst) => {
                const active = instructorId === inst.id;
                const firstNote = inst.slots.find((slot) => slot.note)?.note;
                return (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => setInstructorId(inst.id)}
                    className={cn(
                      "group rounded-3xl border-2 bg-card/85 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
                      active ? "border-primary ring-4 ring-primary/15" : "border-border/70 hover:border-primary/50",
                    )}
                  >
                    <div className="flex gap-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-lg font-bold">
                        {inst.profileImageUrl ? (
                          <img src={inst.profileImageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          `${inst.firstName?.[0] ?? ""}${inst.lastName?.[0] ?? ""}`
                        )}
                        {active && (
                          <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-bold">{inst.firstName} {inst.lastName}</h3>
                        <p className="text-sm text-muted-foreground">{inst.specialty || "ครูฝึกว่ายน้ำ"}</p>
                        {inst.experience && <p className="text-xs text-muted-foreground">ประสบการณ์ {inst.experience}</p>}
                      </div>
                    </div>

                    {firstNote && (
                      <div className="mt-3 rounded-2xl bg-primary/8 border border-primary/15 px-3 py-2 text-sm text-primary">
                        คอร์ส/หมายเหตุ: {firstNote}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {inst.slots.slice(0, 4).map((slot) => (
                        <span key={slot.id} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                          {slot.startTime}-{slot.endTime}
                          {slot.note ? ` · ${slot.note}` : ""}
                        </span>
                      ))}
                      {inst.slots.length > 4 && (
                        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">+{inst.slots.length - 4} เวลา</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-dashed bg-muted/40 p-8 text-center">
              <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium">วันนี้ยังไม่มีครูฝึกลงเวลาสอน</p>
              <p className="text-sm text-muted-foreground">ลองเลือกวันอื่น หรือแจ้งแอดมินให้เพิ่มตารางสอนครูฝึก</p>
            </div>
          )}
        </div>

        {/* STEP 3: SELECT SESSION */}
        <div ref={slotSectionRef} className={cn("transition-all duration-700 space-y-6", instructorId ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none hidden")}>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              เลือกช่วงเวลา
            </h2>
            {date && <span className="text-muted-foreground">{format(date, "d MMM yyyy", { locale: th })}</span>}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : slots && slots.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slots.map((slot) => {
                const isFull = false;
                const isMaintenance = !slot.available;
                const isSelected = selectedSlot === slot.startTime;
                const teacherSlot = teachingSlotForPoolSlot(slot.startTime, slot.endTime);
                const isTeacherUnavailable = !teacherSlot || teacherSlot.remainingPeople <= 0;
                const teacherBookedPeople = teacherSlot?.bookedPeople ?? 0;
                const teacherMaxPeople = teacherSlot?.maxPeople ?? 5;
                const pct = Math.round((teacherBookedPeople / teacherMaxPeople) * 100);
                
                let statusColor = "emerald";
                if (pct >= 80 || isFull) statusColor = "rose";
                else if (pct >= 50) statusColor = "amber";

                const isUnavailable = isMaintenance || isTeacherUnavailable;

                return (
                  <div
                    key={slot.startTime}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!isUnavailable) {
                        setSelectedSlot(slot.startTime);
                        setPeople(1);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if (!isUnavailable) {
                          setSelectedSlot(slot.startTime);
                          setPeople(1);
                        }
                      }
                    }}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all duration-300",
                      isUnavailable ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" : 
                      isSelected ? "bg-card border-primary ring-4 ring-primary/20 shadow-xl shadow-primary/10 scale-[1.02] z-10" : 
                      "bg-card hover:shadow-lg hover:scale-[1.01] cursor-pointer hover:border-primary/50 border-transparent shadow-sm",
                      !isUnavailable && !isSelected && statusColor === "emerald" && "border-emerald-100 dark:border-emerald-900/50",
                      !isUnavailable && !isSelected && statusColor === "amber" && "border-amber-100 dark:border-amber-900/50",
                      !isUnavailable && !isSelected && statusColor === "rose" && "border-rose-100 dark:border-rose-900/50"
                    )}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-2xl font-bold tracking-tight">
                        {slot.startTime} <span className="text-muted-foreground font-normal mx-1">—</span> {slot.endTime}
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider",
                        isMaintenance ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" :
                        isFull ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400" :
                        isTeacherUnavailable ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400" :
                        isSelected ? "bg-primary text-primary-foreground" :
                        statusColor === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" :
                        statusColor === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400" :
                        "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400"
                      )}>
                        {isMaintenance ? "ปิดปรับปรุง" : isFull ? "สระเต็ม" : isTeacherUnavailable ? "ครูไม่ว่าง" : isSelected ? "เลือกแล้ว" : "ว่าง"}
                      </div>
                    </div>

                    {teacherSlot && (
                      <div className="mb-4 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-sm">
                        <div className="font-semibold text-primary">
                          {selectedInstructor?.firstName} {selectedInstructor?.lastName} สอนช่วงนี้
                        </div>
                        <div className="text-xs text-muted-foreground">
                          จองแล้ว {teacherSlot.bookedPeople}/{teacherSlot.maxPeople} คน · รับได้อีก {teacherSlot.remainingPeople} คน
                          {teacherSlot.note ? ` · คอร์ส/หมายเหตุ: ${teacherSlot.note}` : ""}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 mb-4">
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            statusColor === "emerald" ? "bg-emerald-500" :
                            statusColor === "amber" ? "bg-amber-500" :
                            "bg-rose-500"
                          )}
                          style={{ width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                        />
                      </div>
                      <div className="flex justify-between text-sm font-medium text-muted-foreground">
                        <span>ครูคนนี้ {teacherBookedPeople} / {teacherMaxPeople} คน</span>
                        <span>{pct}%</span>
                      </div>
                    </div>

                    {!isUnavailable && (
                      <div className={cn(
                        "text-sm font-semibold mt-4 text-center py-2 rounded-xl transition-colors",
                        isSelected ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
                      )}>
                        {isSelected ? "เลือกช่วงเวลานี้แล้ว" : "คลิกเพื่อเลือกช่วงเวลานี้"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center p-12 bg-muted/50 rounded-2xl border-2 border-dashed">
              <p className="text-muted-foreground text-lg">ไม่พบช่วงเวลาในวันที่เลือก</p>
            </div>
          )}
        </div>

        {/* STEP 3: CONFIRM */}
        <div ref={confirmSectionRef} className={cn("transition-all duration-700", selectedSlot ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none hidden")}>
          <div className="flex items-center gap-2 mb-6">
            <CheckCircle2 className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">ยืนยันการจอง</h2>
          </div>

          <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-xl overflow-hidden rounded-3xl">
            <CardContent className="p-6 md:p-8 space-y-8">
              {/* Summary Card */}
              <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 p-6 rounded-2xl border border-blue-100 dark:border-blue-900 flex flex-col sm:flex-row items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                  <Waves className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-center sm:text-left space-y-1">
                  <h3 className="text-xl font-bold text-blue-950 dark:text-blue-100">Aquarich Pool</h3>
                  <p className="text-blue-800/80 dark:text-blue-300 font-medium">
                    {date && format(date, "d MMMM yyyy", { locale: th })} • {selectedSlotData?.startTime} - {selectedSlotData?.endTime}
                  </p>
                </div>
              </div>

              {selectedInstructor && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex gap-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-bold">
                      {selectedInstructor.profileImageUrl ? (
                        <img src={selectedInstructor.profileImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        `${selectedInstructor.firstName?.[0] ?? ""}${selectedInstructor.lastName?.[0] ?? ""}`
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">ครูฝึกที่เลือก</p>
                      <h3 className="text-lg font-bold">{selectedInstructor.firstName} {selectedInstructor.lastName}</h3>
                      <p className="text-sm text-muted-foreground">{selectedInstructor.specialty || "ครูฝึกว่ายน้ำ"}</p>
                      {selectedTeacherSlot?.note && (
                        <p className="mt-1 text-sm text-primary">คอร์ส/หมายเหตุ: {selectedTeacherSlot.note}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-8">
                {/* Stepper */}
                <div className="space-y-4">
                  <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">จำนวนผู้ใช้งาน</label>
                  <div className="flex items-center p-2 bg-secondary rounded-2xl w-fit">
                    <button 
                      onClick={() => setPeople(Math.max(1, people - 1))}
                      disabled={people <= 1}
                      className="w-12 h-12 rounded-xl bg-background shadow-sm flex items-center justify-center text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[48px] min-h-[48px]"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <div className="w-20 text-center text-3xl font-bold">
                      {people}
                    </div>
                    <button 
                      onClick={() => setPeople(Math.min(
                        selectedTeacherSlot ? selectedTeacherSlot.remainingPeople : 1,
                        people + 1,
                      ))}
                      disabled={
                        !selectedTeacherSlot ||
                        people >= selectedTeacherSlot.remainingPeople
                      }
                      className="w-12 h-12 rounded-xl bg-background shadow-sm flex items-center justify-center text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[48px] min-h-[48px]"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    ครูฝึกรับได้อีก {selectedTeacherSlot?.remainingPeople ?? 0} คนในช่วงเวลานี้
                  </p>
                </div>

                {/* Notes */}
                <div className="space-y-4">
                  <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">หมายเหตุ (ถ้ามี)</label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="เช่น ต้องการเก้าอี้ผ้าใบเพิ่ม..."
                    className="resize-none rounded-2xl min-h-[120px] bg-secondary/50 border-transparent focus:bg-background transition-colors"
                  />
                </div>
              </div>

              {/* Package quota summary */}
              <div className="rounded-2xl border bg-secondary/30 p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Ticket className="w-4 h-4" /> สิทธิ์การใช้งาน
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">จำนวนครั้งคงเหลือในแพ็กเกจ</span>
                  <span className={cn("text-2xl font-extrabold", hasQuota ? "text-primary" : "text-destructive")}>
                    {remaining === null ? "ไม่จำกัด" : `${remaining} ครั้ง`}
                  </span>
                </div>
                {usablePackages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">เลือกแพ็กเกจที่จะใช้หักแต้ม</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {usablePackages.map((pkg) => {
                        const active = memberPackageId === pkg.memberPackageId;
                        return (
                          <button
                            key={pkg.memberPackageId}
                            type="button"
                            onClick={() => setMemberPackageId(pkg.memberPackageId)}
                            className={cn(
                              "rounded-2xl border-2 bg-background p-3 text-left transition-all",
                              active ? "border-primary ring-4 ring-primary/15" : "border-border hover:border-primary/50",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold">{pkg.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  หมดอายุ {new Date(pkg.endDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                </div>
                              </div>
                              {active && <Check className="h-5 w-5 text-primary" />}
                            </div>
                            <div className="mt-2 text-sm text-primary font-bold">
                              คงเหลือ {pkg.remaining === null ? "ไม่จำกัด" : `${pkg.remaining} ครั้ง`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 p-3 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  การจองจะหัก 1 ครั้งจากแพ็กเกจที่เลือกทันที หากยังอยู่ระหว่างอนุมัติและยกเลิก ระบบจะคืนแต้มให้อัตโนมัติ
                </div>
                {!hasQuota && (
                  <div className="flex items-start gap-2 rounded-xl bg-destructive/10 text-destructive p-3 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      {hasActivePackage ? "จำนวนครั้งในแพ็กเกจหมดแล้ว" : "คุณยังไม่มีแพ็กเกจที่ใช้งานได้"}
                      <div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => setLocation("/packages")}
                        >
                          <Ticket className="w-3.5 h-3.5" /> ซื้อแพ็กเกจ
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky Bottom CTA for Mobile & Desktop */}
      {selectedSlot && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t z-50 animate-in slide-in-from-bottom-full duration-500">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {selectedInstructor ? `ครู${selectedInstructor.firstName} ${selectedInstructor.lastName}` : "ยังไม่ได้เลือกครู"} · รวม {people} ท่าน
              </p>
              <p className="text-lg font-bold flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-primary" />
                {selectedPackage ? <>ใช้แพ็กเกจ: {selectedPackage.name}</> : "กรุณาเลือกแพ็กเกจ"}
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleBook}
              disabled={createReservation.isPending || !hasQuota || !selectedInstructor || !selectedTeacherSlot || !selectedPackage || people > selectedTeacherSlot.remainingPeople}
              className="w-full sm:w-auto min-h-[56px] px-8 rounded-full bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 text-white shadow-lg shadow-primary/25 text-lg font-bold transition-all hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
            >
              {createReservation.isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> กำลังดำเนินการ...</>
              ) : !hasQuota ? (
                "ไม่มีสิทธิ์จอง"
              ) : (
                "ยืนยันการจอง"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
