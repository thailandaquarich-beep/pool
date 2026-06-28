import { FC, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/i18n";
import {
  LayoutDashboard, CalendarDays, CalendarPlus, Calendar, User,
  Settings, Users, LogOut, Droplets, Building2, GraduationCap,
  Bell, Wallet, CreditCard, Crown, MessageCircle, QrCode, ScanLine, ShoppingBag, Bot, Package, Sparkles, Palette, LifeBuoy, Clock, TrendingUp, CalendarOff,
  ClipboardList, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/brand";

export const Sidebar: FC = () => {
  const [location] = useLocation();
  const { user, isAdmin, isInstructor, isStaff, logout } = useAuth();
  const { t } = useTranslation();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [unreadChat, setUnreadChat] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [devUnread, setDevUnread] = useState(0);
  const [leavePending, setLeavePending] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchCounts = () => {
      fetch(`${baseUrl}/api/chat/unread`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setUnreadChat(d.unreadCount || 0)).catch(() => {});
      fetch(`${baseUrl}/api/orders/admin/pending-count`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setPendingOrders(d.count || 0)).catch(() => {});
      fetch(`${baseUrl}/api/dev-support/unread`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setDevUnread(d.unreadCount || 0)).catch(() => {});
      fetch(`${baseUrl}/api/leave/pending-count`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setLeavePending(d.count || 0)).catch(() => {});
    };
    fetchCounts();
    const iv = setInterval(fetchCounts, 30000);
    return () => clearInterval(iv);
  }, [isAdmin]);

  const memberGroups = [
    {
      title: "เริ่มใช้งาน",
      links: [
        { href: "/dashboard", label: "ภาพรวมสมาชิก", icon: LayoutDashboard },
        { href: "/book", label: "จองคลาส/สระ", icon: CalendarPlus },
        { href: "/reservations", label: "การจองของฉัน", icon: CalendarDays },
        { href: "/calendar", label: "ปฏิทินคลาส", icon: Calendar },
        { href: "/instructors", label: "ครูฝึก", icon: GraduationCap },
      ],
    },
    {
      title: "สมาชิกและแพ็กเกจ",
      links: [
        { href: "/membership-card", label: "บัตรสมาชิก QR", icon: QrCode },
        { href: "/packages", label: "แพ็กเกจของฉัน", icon: Crown },
        { href: "/wallet", label: "กระเป๋าเงิน", icon: Wallet },
      ],
    },
    {
      title: "ร้านค้าและบริการ",
      links: [
        { href: "/products", label: "ร้านค้าสโมสร", icon: ShoppingBag },
        { href: "/my-orders", label: "คำสั่งซื้อของฉัน", icon: Package },
        { href: "/services", label: "บริการอื่น ๆ", icon: Sparkles },
      ],
    },
    {
      title: "บัญชีและช่วยเหลือ",
      links: [
        { href: "/chat", label: "ติดต่อเรา", icon: MessageCircle },
        { href: "/profile", label: "โปรไฟล์", icon: User },
      ],
    },
  ];
  const memberLinks = memberGroups.flatMap((group) => group.links);

  const adminGroups = [
    {
      title: "ภาพรวมระบบ",
      links: [
        { href: "/admin", label: t("nav.admin.dashboard"), icon: LayoutDashboard },
        ...((user as any)?.role === "super_admin" ? [
          { href: "/admin/overview", label: "ภาพรวมทุกสาขา", icon: TrendingUp },
          { href: "/admin/branches", label: "จัดการสาขา", icon: Building2 },
        ] : []),
      ],
    },
    {
      title: "การจองและการสอน",
      links: [
        { href: "/admin/reservations", label: t("nav.admin.reservations"), icon: CalendarDays },
        { href: "/admin/facilities", label: t("nav.admin.facilities"), icon: Building2 },
        { href: "/admin/instructors", label: t("nav.admin.instructors"), icon: GraduationCap },
        { href: "/admin/checkin", label: "สแกนเช็คอิน", icon: ScanLine },
      ],
    },
    {
      title: "สมาชิกและแพ็กเกจ",
      links: [
        { href: "/admin/members", label: t("nav.admin.members"), icon: Users },
        { href: "/admin/wallet", label: t("nav.admin.wallet"), icon: Wallet },
      ],
    },
    {
      title: "การขาย",
      links: [
        { href: "/admin/orders", label: "ระบบการขาย", icon: ShoppingBag, badge: pendingOrders > 0 ? pendingOrders : undefined },
      ],
    },
    {
      title: "สื่อสารและช่วยเหลือ",
      links: [
        { href: "/admin/announcements", label: t("nav.admin.announcements"), icon: Bell },
        { href: "/admin/chat", label: t("nav.admin.chat"), icon: MessageCircle, badge: unreadChat > 0 ? unreadChat : undefined },
        ...((user as any)?.role === "super_admin" ? [{ href: "/admin/ai-chat", label: "วิเคราะห์แชท AI", icon: Bot }] : []),
        { href: "/admin/help", label: "ศูนย์ช่วยเหลือ", icon: LifeBuoy, badge: devUnread > 0 ? devUnread : undefined },
      ],
    },
    {
      title: "พนักงาน",
      links: [
        { href: "/admin/work-plan", label: "วางแผนงาน", icon: ClipboardList },
        { href: "/admin/attendance", label: "ลงเวลา/กะพนักงาน", icon: Clock },
        { href: "/admin/leave", label: "คำขอลาพนักงาน", icon: CalendarOff, badge: leavePending > 0 ? leavePending : undefined },
      ],
    },
    {
      title: "ตั้งค่าระบบ",
      links: [
        ...((user as any)?.role === "super_admin" ? [
          { href: "/admin/audit-logs", label: "บันทึกความปลอดภัย", icon: ShieldCheck },
        ] : []),
        { href: "/admin/theme", label: "ธีมสีเว็บไซต์", icon: Palette },
        { href: "/admin/settings", label: t("nav.admin.settings"), icon: Settings },
      ],
    },
  ];

  const instructorLinks = [
    { href: "/instructor/schedule", label: "ตารางสอนของฉัน", icon: CalendarDays },
    { href: "/tasks", label: "ภารกิจประจำวัน", icon: ClipboardList },
    { href: "/attendance", label: "ลงเวลางาน", icon: Clock },
    { href: "/leave", label: "การลา", icon: CalendarOff },
    ...memberLinks,
  ];

  // Employees (staff) — clock in/out, leave, and their own profile.
  const staffLinks = [
    { href: "/tasks", label: "ภารกิจประจำวัน", icon: ClipboardList },
    { href: "/attendance", label: "ลงเวลางาน", icon: Clock },
    { href: "/leave", label: "การลา", icon: CalendarOff },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  const sidebarGroups = isAdmin
    ? adminGroups
    : isInstructor
      ? [{ title: "งานครูและพนักงาน", links: instructorLinks.slice(0, 4) }, ...memberGroups]
      : isStaff
        ? [{ title: "พนักงาน", links: staffLinks }]
        : memberGroups;
  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() : "U";
  const avatarUrl = (user as any)?.profileImageUrl;

  return (
    <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border h-[100dvh] sticky top-0">
      <div className="p-4 border-b border-sidebar-border">
        <BrandMark size="md" tagline />
      </div>

      <nav className="flex-1 p-4 space-y-0.5 overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground mb-3 px-3">{isAdmin ? "ADMIN" : isInstructor ? "INSTRUCTOR" : isStaff ? "พนักงาน" : "MEMBER"}</div>
        {sidebarGroups.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <div className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/80">
              {group.title}
            </div>
            {group.links.map((link) => {
              const isActive = location === link.href;
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-brand text-white shadow-md shadow-[hsl(var(--glow)/0.35)]"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
                  )}>
                    <div className={cn("p-1 rounded-lg transition-colors", isActive ? "bg-white/20" : "")}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="flex-1">{link.label}</span>
                    {(link as any).badge && (
                      <Badge className="ml-auto bg-red-500 text-white text-xs min-w-5 h-5 flex items-center justify-center rounded-full px-1">
                        {(link as any).badge}
                      </Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-4">
        {user && (
          <div className="flex items-center gap-3 px-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 overflow-hidden ring-2 ring-primary/20">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">{user.firstName} {user.lastName}</div>
              <div className="text-xs text-sidebar-foreground/60 truncate font-mono">{(user as any).memberCode ?? ""}</div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:text-destructive hover:bg-destructive/10" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />{t("nav.logout")}
        </Button>
      </div>
    </aside>
  );
};
