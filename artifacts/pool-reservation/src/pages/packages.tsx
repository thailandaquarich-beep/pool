import { FC, useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Crown, CheckCircle2, Calendar, Zap, ShoppingBag, History, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Package = { id: number; name: string; nameEn: string; category?: string | null; description?: string; imageUrl?: string | null; price: number; durationDays: number; benefits?: string; bookingDiscount: number; maxBookingsPerMonth?: number; isActive: boolean };
type MemberPackage = { id: number; packageId: number; pricePaid: number; bookingsUsed: number; status: string; startDate: string; endDate: string; isExpired: boolean; package: Package };

const remainingOf = (mp: MemberPackage): number | null =>
  mp.package.maxBookingsPerMonth == null ? null : Math.max(0, mp.package.maxBookingsPerMonth - mp.bookingsUsed);
type CourseUsage = { id: number; createdAt: string; source: string; packageName?: string; reservation?: { date: string; startTime: string; endTime: string } | null };
type CoursePurchase = { id: number; createdAt: string; packageName: string; amount: number; status: string };

export const Packages: FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [packages, setPackages] = useState<Package[]>([]);
  const [myPackages, setMyPackages] = useState<MemberPackage[]>([]);
  const [wallet, setWallet] = useState<{ balance: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyPkg, setBuyPkg] = useState<Package | null>(null);
  const [buying, setBuying] = useState(false);
  const [history, setHistory] = useState<{ usages: CourseUsage[]; purchases: CoursePurchase[] }>({ usages: [], purchases: [] });

  const fetchAll = async () => {
    setLoading(true);
    const [pkRes, myRes, wRes, hRes] = await Promise.all([
      fetch(`${baseUrl}/api/packages`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${baseUrl}/api/packages/my`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${baseUrl}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${baseUrl}/api/packages/my/history`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pkRes.ok) setPackages(await pkRes.json());
    if (myRes.ok) setMyPackages(await myRes.json());
    if (wRes.ok) setWallet(await wRes.json());
    if (hRes.ok) { const h = await hRes.json(); setHistory({ usages: h.usages ?? [], purchases: h.purchases ?? [] }); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleBuy = async () => {
    if (!buyPkg) return;
    setBuying(true);
    try {
      const res = await fetch(`${baseUrl}/api/packages/${buyPkg.id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: t("pkg.purchaseSuccess") });
      fetchAll();
    } catch (err: any) {
      toast({ title: err.message.includes("ไม่เพียงพอ") ? t("pkg.insufficientBalance") : err.message, variant: "destructive" });
    } finally {
      setBuying(false);
      setBuyPkg(null);
    }
  };

  const activePackages = myPackages.filter(mp => mp.status === "active" && !mp.isExpired);

  if (loading) return <div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader title={t("pkg.title")} icon={Crown} gradient="from-amber-400 to-orange-600" />

      {/* แพ็กเกจที่กำลังใช้งาน (ทุกใบ) */}
      {activePackages.length > 0 && (
        <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-300/60 dark:border-amber-400/20">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><Crown className="w-4 h-4 text-amber-500" /> แพ็กเกจที่กำลังใช้งาน</div>
            {activePackages.map((mp) => {
              const rem = remainingOf(mp);
              return (
                <div key={mp.id} className="flex items-center gap-3 rounded-xl bg-background/60 p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{mp.package.name}{mp.package.category ? <span className="ml-1.5 text-[11px] text-muted-foreground">· {mp.package.category}</span> : null}</div>
                    <div className="text-xs text-muted-foreground">{t("pkg.expires")}: {new Date(mp.endDate).toLocaleDateString("th-TH")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-amber-600">{rem === null ? "ไม่จำกัด" : `${rem} ครั้ง`}</div>
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">{t("pkg.active")}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Available packages */}
      <div className="grid sm:grid-cols-2 gap-4">
        {packages.length === 0 ? (
          <p className="text-muted-foreground col-span-2 text-center py-12">{t("pkg.noPackages")}</p>
        ) : packages.map(pkg => {
          const owned = myPackages.find(mp => mp.packageId === pkg.id && mp.status === "active" && !mp.isExpired);
          return (
            <Card key={pkg.id} className={cn("card-lift relative overflow-hidden", owned && "ring-2 ring-amber-400")}>
              {/* corner wash for depth */}
              <div className="pointer-events-none absolute -right-10 -top-10 w-32 h-32 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 opacity-10 blur-2xl" />
              {owned && <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs px-3 py-1 rounded-bl-lg shadow-sm z-10">กำลังใช้งาน</div>}
              {pkg.imageUrl ? (
                <div className="aspect-[16/9] bg-muted">
                  <img src={pkg.imageUrl} alt={pkg.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="aspect-[16/9] bg-gradient-to-br from-amber-100 via-cyan-50 to-white dark:from-amber-950/30 dark:via-cyan-950/20 dark:to-background flex items-center justify-center">
                  <Crown className="w-12 h-12 text-amber-500/70" />
                </div>
              )}
              <CardContent className="p-6 space-y-4 relative">
                <div>
                  <h3 className="text-lg font-display font-bold">{pkg.name}</h3>
                  {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-display font-extrabold text-gradient">฿{pkg.price.toLocaleString()}</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />{pkg.durationDays} {t("pkg.days")}
                  </div>
                  {pkg.bookingDiscount > 0 && (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Zap className="w-4 h-4" />ส่วนลดค่าจอง {pkg.bookingDiscount}%
                    </div>
                  )}
                  {pkg.maxBookingsPerMonth && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4" />จองได้สูงสุด {pkg.maxBookingsPerMonth} ครั้ง/เดือน
                    </div>
                  )}
                  {pkg.benefits && pkg.benefits.split("\n").map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />{b}
                    </div>
                  ))}
                </div>
                {owned && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 p-2.5 text-xs">
                    <span className="font-semibold text-amber-700 dark:text-amber-300">กำลังใช้งาน</span>
                    <span className="text-muted-foreground"> · คงเหลือ {remainingOf(owned) === null ? "ไม่จำกัด" : `${remainingOf(owned)} ครั้ง`} · หมดอายุ {new Date(owned.endDate).toLocaleDateString("th-TH")}</span>
                  </div>
                )}
                <Button className="w-full" onClick={() => setBuyPkg(pkg)}>
                  <ShoppingBag className="w-4 h-4 mr-2" />{owned ? "ซื้อเพิ่ม / ต่ออายุ" : t("pkg.buy")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ประวัติแพ็กเกจสมาชิก / การใช้งาน */}
      <div id="history" className="space-y-4 pt-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><History className="w-5 h-5 text-primary" /> ประวัติแพ็กเกจสมาชิก / การใช้งาน</h2>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /> ประวัติการใช้งานคอร์ส</div>
            {history.usages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีประวัติการใช้งาน</p>
            ) : (
              <div className="space-y-1.5">
                {history.usages.slice(0, 30).map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.packageName}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.source === "checkin" ? "เช็คอินหน้างาน" : "ใช้จากการจอง"}
                        {u.reservation ? ` · ${u.reservation.date} ${u.reservation.startTime}-${u.reservation.endTime}` : ""}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{new Date(u.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> ประวัติการซื้อ/เติมแพ็กเกจ</div>
            {history.purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีประวัติการซื้อแพ็กเกจ</p>
            ) : (
              <div className="space-y-1.5">
                {history.purchases.slice(0, 30).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.packageName}</div>
                      <div className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</div>
                    </div>
                    <span className="font-semibold text-primary whitespace-nowrap shrink-0">฿{p.amount.toLocaleString("th-TH")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purchase dialog */}
      <AlertDialog open={!!buyPkg} onOpenChange={() => setBuyPkg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการซื้อแพ็กเกจ</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{buyPkg?.name}</p>
              <p className="text-lg font-bold text-primary">฿{buyPkg?.price.toLocaleString()}</p>
              <p className="text-sm">ยอดเงินคงเหลือ: ฿{(wallet?.balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
              {wallet && buyPkg && wallet.balance < buyPkg.price && (
                <p className="text-red-500 text-sm">ยอดเงินไม่พอ กรุณาเติมเงินก่อน</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleBuy} disabled={buying || (wallet ? wallet.balance < (buyPkg?.price ?? 0) : false)}>
              {buying ? "กำลังซื้อ..." : "ยืนยันซื้อ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
