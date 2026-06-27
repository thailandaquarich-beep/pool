import { FC, useState } from "react";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link, useLocation } from "wouter";
import {
  Menu,
  Droplets,
  LayoutDashboard,
  CalendarDays,
  CalendarPlus,
  Calendar,
  User,
  Settings,
  Users,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Building2,
  GraduationCap,
  Bell,
  QrCode,
  ScanLine,
  ShoppingBag,
  ShoppingCart,
  Package,
  Sparkles,
  Bot,
  LifeBuoy,
  CalendarOff,
  Wallet,
  Crown,
  Palette,
  Clock,
  ClipboardList,
  TrendingUp,
  MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand";
import { NotificationBell } from "@/components/notification-bell";
import { BranchSwitcher } from "@/components/branch-switcher";
import { useCart } from "@/hooks/use-cart";

export const Header: FC = () => {
  const { language, setLanguage, t } = useTranslation();
  const { user, isAdmin, isInstructor, isStaff, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { count } = useCart();

  const toggleLanguage = () => {
    setLanguage(language === "th" ? "en" : "th");
  };

  const memberLinks = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/reservations", label: t("nav.reservations"), icon: CalendarDays },
    { href: "/book", label: t("nav.book"), icon: CalendarPlus },
    { href: "/instructors", label: "ครูฝึก", icon: GraduationCap },
    { href: "/membership-card", label: "บัตรสมาชิก", icon: QrCode },
    { href: "/products", label: "ร้านค้าสโมสร", icon: ShoppingBag },
    { href: "/my-orders", label: "คำสั่งซื้อของฉัน", icon: Package },
    { href: "/services", label: "บริการอื่นๆ", icon: Sparkles },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  const adminLinks = [
    { href: "/admin", label: t("nav.admin.dashboard"), icon: LayoutDashboard },
    { href: "/admin/reservations", label: t("nav.admin.reservations"), icon: CalendarDays },
    { href: "/admin/members", label: t("nav.admin.members"), icon: Users },
    { href: "/admin/facilities", label: t("nav.admin.facilities"), icon: Building2 },
    { href: "/admin/instructors", label: t("nav.admin.instructors"), icon: GraduationCap },
    { href: "/admin/checkin", label: "สแกนเช็คอิน", icon: ScanLine },
    { href: "/admin/products", label: "ผลิตภัณฑ์", icon: ShoppingBag },
    { href: "/admin/orders", label: "คำสั่งซื้อ", icon: Package },
    { href: "/admin/ai-chat", label: "วิเคราะห์แชท AI", icon: Bot },
    { href: "/admin/announcements", label: t("nav.admin.announcements"), icon: Bell },
    { href: "/admin/help", label: "ศูนย์ช่วยเหลือ", icon: LifeBuoy },
    { href: "/admin/work-plan", label: "วางแผนงาน", icon: ClipboardList },
    { href: "/admin/leave", label: "คำขอลาพนักงาน", icon: CalendarOff },
    { href: "/admin/settings", label: t("nav.admin.settings"), icon: Settings },
  ];

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
        { href: "/admin/packages", label: t("nav.admin.packages"), icon: Crown },
      ],
    },
    {
      title: "ร้านค้าและคำสั่งซื้อ",
      links: [
        { href: "/admin/products", label: "ผลิตภัณฑ์", icon: ShoppingBag },
        { href: "/admin/orders", label: "คำสั่งซื้อ", icon: Package },
      ],
    },
    {
      title: "สื่อสารและช่วยเหลือ",
      links: [
        { href: "/admin/announcements", label: t("nav.admin.announcements"), icon: Bell },
        { href: "/admin/chat", label: t("nav.admin.chat"), icon: MessageCircle },
        ...((user as any)?.role === "super_admin" ? [{ href: "/admin/ai-chat", label: "วิเคราะห์แชท AI", icon: Bot }] : []),
        { href: "/admin/help", label: "ศูนย์ช่วยเหลือ", icon: LifeBuoy },
      ],
    },
    {
      title: "พนักงาน",
      links: [
        { href: "/admin/work-plan", label: "วางแผนงาน", icon: ClipboardList },
        { href: "/admin/attendance", label: "ลงเวลา/กะพนักงาน", icon: Clock },
        { href: "/admin/leave", label: "คำขอลาพนักงาน", icon: CalendarOff },
      ],
    },
    {
      title: "ตั้งค่าระบบ",
      links: [
        { href: "/admin/theme", label: "ธีมสีเว็บไซต์", icon: Palette },
        { href: "/admin/settings", label: t("nav.admin.settings"), icon: Settings },
      ],
    },
  ];

  const instructorLinks = [
    { href: "/instructor/schedule", label: "ตารางสอนของฉัน", icon: CalendarDays },
    { href: "/tasks", label: "ภารกิจประจำวัน", icon: ClipboardList },
    { href: "/attendance", label: "ลงเวลางาน", icon: CalendarDays },
    { href: "/leave", label: "การลา", icon: CalendarOff },
    ...memberLinks,
  ];

  const staffLinks = [
    { href: "/tasks", label: "ภารกิจประจำวัน", icon: ClipboardList },
    { href: "/attendance", label: "ลงเวลางาน", icon: CalendarDays },
    { href: "/leave", label: "การลา", icon: CalendarOff },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  const links = isAdmin ? adminLinks : isInstructor ? instructorLinks : isStaff ? staffLinks : memberLinks;

  const handleNavClick = () => setOpen(false);

  const handleLogout = () => {
    setOpen(false);
    logout();
  };

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      {/* Mobile hamburger + brand */}
      <div className="flex items-center gap-1 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2"
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="p-4 border-b border-border">
              <SheetTitle className="text-left">
                <BrandMark size="md" tagline />
              </SheetTitle>
            </SheetHeader>

            {/* User info */}
            {user && (
              <div className="px-4 py-3 bg-primary/5 border-b border-border">
                <div className="text-sm font-medium text-foreground">
                  {user.firstName} {user.lastName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {(user as any).memberCode ?? ""} · {isAdmin ? "Admin" : "Member"}
                </div>
              </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {isAdmin ? adminGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </div>
                  {group.links.map((link) => {
                    const isActive = location === link.href;
                    const Icon = link.icon;
                    return (
                      <Link key={link.href} href={link.href}>
                        <div
                          onClick={handleNavClick}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                          data-testid={`link-mobile-${link.href.replace(/\//g, "-")}`}
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          <span className="flex-1">{link.label}</span>
                          {isActive && <ChevronRight className="w-4 h-4 opacity-60" />}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )) : links.map((link) => {
                const isActive = location === link.href;
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href}>
                    <div
                      onClick={handleNavClick}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                      data-testid={`link-mobile-${link.href.replace(/\//g, "-")}`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1">{link.label}</span>
                      {isActive && <ChevronRight className="w-4 h-4 opacity-60" />}
                    </div>
                  </Link>
                );
              })}
            </nav>

            {/* Bottom actions */}
            <div className="p-3 border-t border-border space-y-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="w-full justify-start font-medium text-sm"
              >
                {theme === "dark" ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                {t("theme.toggle")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleLanguage}
                className="w-full justify-start font-medium text-sm"
                data-testid="button-mobile-language"
              >
                {language === "th" ? "🌐 English" : "🌐 ภาษาไทย"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 font-medium text-sm"
                onClick={handleLogout}
                data-testid="button-mobile-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t("nav.logout")}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <BrandMark size="sm" />
      </div>

      {/* Desktop: greeting */}
      <div className="hidden md:flex items-center text-sm text-muted-foreground">
        {user
          ? `${t("dash.welcome")}, ${user.firstName} ${user.lastName}`
          : ""}
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 ml-auto">
        {/* super_admin branch switcher (self-hides for everyone else) */}
        <BranchSwitcher />
        {!isAdmin && (
          <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/cart")} title="ตะกร้าสินค้า">
            <ShoppingCart className="w-4 h-4" />
            {count > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{count}</span>}
          </Button>
        )}
        <NotificationBell />

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="hidden md:inline-flex"
          title={t("theme.toggle")}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleLanguage}
          className="hidden md:inline-flex font-medium"
          data-testid="button-language-toggle"
        >
          {language === "th" ? "EN" : "ไทย"}
        </Button>

        {/* Desktop logout button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="hidden md:flex items-center gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          data-testid="button-desktop-logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden lg:inline">{t("nav.logout")}</span>
        </Button>
      </div>
    </header>
  );
};
