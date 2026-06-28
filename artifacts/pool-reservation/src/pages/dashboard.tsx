import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetMemberStats, useGetUpcomingReservations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  QrCode,
  ShoppingBag,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

const money = (value: number) => `฿${Number(value || 0).toLocaleString("th-TH")}`;

export const Dashboard: FC = () => {
  const { user } = useAuth();
  const { data: stats } = useGetMemberStats();
  const { data: upcoming } = useGetUpcomingReservations();

  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const memberCode = (user as any)?.memberCode ?? "-";

  const { data: usage } = useQuery<any>({
    queryKey: ["packages", "my-usage"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/packages/my-usage`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : { totalRemaining: 0, packages: [] };
    },
  });

  const { data: wallet } = useQuery<any>({
    queryKey: ["wallet", "me"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : { balance: 0 };
    },
  });

  const remaining = usage?.totalRemaining ?? 0;
  const balance = Number(wallet?.balance ?? 0);
  const pkg = usage?.packages?.[0];
  const daysLeft = pkg ? Math.max(0, Math.ceil((new Date(pkg.endDate).getTime() - Date.now()) / 86400000)) : null;
  const reservations = (upcoming ?? []).slice(0, 5);
  const nextReservation = reservations[0] as any;

  const primaryActions = [
    {
      href: "/book",
      label: "จองคลาส/สระ",
      detail: "เลือกวัน ครูฝึก เวลา และแพ็กเกจที่จะใช้หักสิทธิ์",
      icon: CalendarPlus,
      className: "bg-[#f2c200] text-[#183a5a] hover:bg-[#ffd83d]",
    },
    {
      href: "/membership-card",
      label: "เปิดบัตรสมาชิก QR",
      detail: "ใช้แสดงตัวตนหรือเช็กอินที่หน้าเคาน์เตอร์",
      icon: QrCode,
      className: "bg-[#1098d4] text-white hover:bg-[#0b86bd]",
    },
    {
      href: "/packages",
      label: "ดูแพ็กเกจ",
      detail: "ตรวจจำนวนครั้งคงเหลือ วันหมดอายุ และซื้อเพิ่ม",
      icon: Ticket,
      className: "bg-[#183a5a] text-white hover:bg-[#102f4b]",
    },
  ];

  const accountCards = [
    {
      label: "รหัสสมาชิก",
      value: memberCode,
      detail: "ใช้สำหรับยืนยันตัวตนกับพนักงาน",
      icon: BadgeCheck,
      href: "/membership-card",
      tone: "text-[#1098d4] bg-[#e8f4fb]",
    },
    {
      label: "สิทธิ์คงเหลือ",
      value: remaining === null ? "ไม่จำกัด" : `${remaining} ครั้ง`,
      detail: "แตะเพื่อดูแพ็กเกจคงเหลือ / ประวัติการใช้งาน",
      icon: Ticket,
      href: "/my-packages",
      tone: "text-[#0f8f7e] bg-[#e8f8f4]",
    },
    {
      label: "กระเป๋าเงิน",
      value: money(balance),
      detail: "ใช้ซื้อแพ็กเกจ สินค้า หรือบริการอื่น ๆ",
      icon: Wallet,
      href: "/wallet",
      tone: "text-[#b47a00] bg-[#fff6d6]",
    },
    {
      label: "อายุแพ็กเกจ",
      value: daysLeft === null ? "ยังไม่มีแพ็กเกจ" : `เหลือ ${daysLeft} วัน`,
      detail: "ควรต่อแพ็กเกจก่อนหมดอายุเพื่อจองได้ต่อเนื่อง",
      icon: CalendarClock,
      href: "/packages",
      tone: "text-[#e0218a] bg-[#fde8f3]",
    },
  ];

  const statCards = [
    { label: "การจองทั้งหมด", value: stats?.totalReservations ?? 0, detail: "ประวัติการใช้งานสะสม", icon: CalendarDays, href: "/reservations" },
    { label: "กำลังจะมาถึง", value: stats?.upcomingCount ?? 0, detail: "รอบที่ต้องเตรียมตัว", icon: CalendarCheck, href: "/reservations" },
    { label: "เดือนนี้", value: stats?.thisMonthCount ?? 0, detail: "จำนวนครั้งที่จองในเดือนนี้", icon: Clock, href: "/calendar" },
    { label: "ยกเลิกแล้ว", value: stats?.cancelledCount ?? 0, detail: "รายการที่ถูกยกเลิก", icon: CalendarX, href: "/reservations" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-lg bg-[#183a5a] text-white shadow-sm">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-sm font-semibold text-[#f2c200]">
              <BadgeCheck className="h-4 w-4" />
              ระบบสมาชิก Aqua Rich
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
                สวัสดี {user?.firstName || "สมาชิก"} จัดการทุกอย่างได้จากหน้านี้
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-white/78">
                เริ่มจากจองคลาส ตรวจสิทธิ์แพ็กเกจ เปิดบัตรสมาชิก หรือดูประวัติการจอง เมนูด้านซ้ายถูกจัดกลุ่มตามงานจริงเพื่อให้หาเรื่องที่ต้องการได้เร็วขึ้น
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {primaryActions.map((action) => (
                <Link key={action.href} href={action.href} className="block">
                  <Button className={`h-auto w-full justify-start gap-3 rounded-lg p-4 text-left ${action.className}`}>
                    <action.icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-bold">{action.label}</span>
                      <span className="mt-1 block whitespace-normal text-xs font-medium opacity-80">{action.detail}</span>
                    </span>
                  </Button>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/16 bg-white/10 p-5">
            <div className="text-sm font-semibold text-[#f2c200]">รอบถัดไป</div>
            {nextReservation ? (
              <div className="mt-3 space-y-3">
                <div className="font-display text-xl font-extrabold">
                  {new Date(`${nextReservation.date}T00:00:00`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <div className="space-y-2 text-sm text-white/82">
                  <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-[#f2c200]" /> {nextReservation.startTime} - {nextReservation.endTime}</p>
                  <p className="flex items-center gap-2"><Users className="h-4 w-4 text-[#f2c200]" /> {nextReservation.numberOfPeople} คน</p>
                  {nextReservation.instructor && (
                    <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-[#f2c200]" /> ครู {nextReservation.instructor.firstName} {nextReservation.instructor.lastName}</p>
                  )}
                </div>
                <Button asChild variant="secondary" className="w-full rounded-lg bg-white text-[#183a5a] hover:bg-[#f5fbff]">
                  <Link href="/reservations">ดูรายละเอียดการจอง <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <p className="leading-7 text-white/78">ยังไม่มีรอบที่กำลังจะมาถึง กดจองคลาส/สระเพื่อเลือกเวลาที่สะดวกได้เลย</p>
                <Button asChild className="w-full rounded-lg bg-[#f2c200] text-[#183a5a] hover:bg-[#ffd83d]">
                  <Link href="/book">เริ่มจองตอนนี้</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {accountCards.map((card) => (
          <Link key={card.label} href={card.href} className="block">
            <Card className="h-full rounded-lg border-[#dcebf5] bg-white/92 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-card">
              <CardContent className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-muted-foreground">{card.label}</div>
                    <div className="mt-1 truncate font-display text-2xl font-extrabold text-[#183a5a] dark:text-foreground">{card.value}</div>
                  </div>
                  <div className={`rounded-lg p-2 ${card.tone}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold text-[#183a5a] dark:text-foreground">สรุปการใช้งาน</h2>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/reservations">ดูทั้งหมด</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {statCards.map((card) => (
              <Link key={card.label} href={card.href} className="block">
                <Card className="rounded-lg border-[#dcebf5] bg-[#f8fcff] shadow-sm transition hover:border-[#1098d4]/50 dark:bg-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">{card.label}</div>
                        <div className="mt-1 font-display text-3xl font-extrabold text-[#1098d4]">{card.value}</div>
                      </div>
                      <card.icon className="h-5 w-5 text-[#1098d4]" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.detail}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold text-[#183a5a] dark:text-foreground">การจองที่กำลังจะมาถึง</h2>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/book">จองเพิ่ม</Link>
            </Button>
          </div>
          <Card className="rounded-lg border-[#dcebf5] bg-white/92 shadow-sm dark:bg-card">
            <CardContent className="space-y-3 p-4">
              {reservations.length > 0 ? reservations.map((r: any) => (
                <Link key={r.id} href="/reservations" className="block rounded-lg border border-[#dcebf5] bg-[#f5fbff] p-4 transition hover:border-[#1098d4]/60 dark:bg-background">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="font-semibold text-[#183a5a] dark:text-foreground">
                        {new Date(`${r.date}T00:00:00`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#1098d4]" /> {r.startTime} - {r.endTime}</span>
                        <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-[#1098d4]" /> {r.numberOfPeople} คน</span>
                        {r.package && <span className="flex items-center gap-1.5"><Ticket className="h-4 w-4 text-[#1098d4]" /> คอร์ส: {r.package.name}</span>}
                        {r.instructor && <span className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-[#1098d4]" /> ครู {r.instructor.firstName} {r.instructor.lastName}</span>}
                        {r.notes && <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-[#1098d4]" /> {r.notes}</span>}
                      </div>
                    </div>
                    <ArrowRight className="hidden h-5 w-5 text-[#1098d4] sm:block" />
                  </div>
                </Link>
              )) : (
                <div className="rounded-lg border border-dashed border-[#dcebf5] bg-[#f8fcff] p-6 text-center dark:bg-background">
                  <CalendarPlus className="mx-auto h-8 w-8 text-[#1098d4]" />
                  <p className="mt-3 font-semibold text-[#183a5a] dark:text-foreground">ยังไม่มีการจองที่กำลังจะมาถึง</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">เลือกวันและครูฝึกจากหน้า “จองคลาส/สระ” ระบบจะพากลับมาดูสถานะได้ที่นี่</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/products" className="block">
          <Card className="rounded-lg border-[#dcebf5] bg-white shadow-sm dark:bg-card">
            <CardContent className="flex items-start gap-3 p-5">
              <ShoppingBag className="mt-1 h-5 w-5 text-[#1098d4]" />
              <div>
                <h3 className="font-bold text-[#183a5a] dark:text-foreground">ร้านค้าสโมสร</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">ซื้ออุปกรณ์หรือสินค้า แล้วติดตามสถานะที่เมนูคำสั่งซื้อของฉัน</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/chat" className="block">
          <Card className="rounded-lg border-[#dcebf5] bg-white shadow-sm dark:bg-card">
            <CardContent className="flex items-start gap-3 p-5">
              <HelpCircle className="mt-1 h-5 w-5 text-[#1098d4]" />
              <div>
                <h3 className="font-bold text-[#183a5a] dark:text-foreground">ต้องการความช่วยเหลือ</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">ส่งคำถาม แจ้งปัญหา หรือขอให้ทีมงานช่วยตรวจข้อมูลสมาชิก</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/profile" className="block">
          <Card className="rounded-lg border-[#dcebf5] bg-white shadow-sm dark:bg-card">
            <CardContent className="flex items-start gap-3 p-5">
              <BadgeCheck className="mt-1 h-5 w-5 text-[#1098d4]" />
              <div>
                <h3 className="font-bold text-[#183a5a] dark:text-foreground">ข้อมูลส่วนตัว</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">แก้ไขชื่อ เบอร์โทร รูปโปรไฟล์ และข้อมูลที่ใช้ติดต่อกลับ</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
};
