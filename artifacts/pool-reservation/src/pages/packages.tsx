import { FC, useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Crown, CheckCircle2, Calendar, Zap, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Package = { id: number; name: string; nameEn: string; description?: string; price: number; durationDays: number; benefits?: string; bookingDiscount: number; maxBookingsPerMonth?: number; isActive: boolean };
type MemberPackage = { id: number; packageId: number; pricePaid: number; status: string; startDate: string; endDate: string; isExpired: boolean; package: Package };

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

  const fetchAll = async () => {
    setLoading(true);
    const [pkRes, myRes, wRes] = await Promise.all([
      fetch(`${baseUrl}/api/packages`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${baseUrl}/api/packages/my`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${baseUrl}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pkRes.ok) setPackages(await pkRes.json());
    if (myRes.ok) setMyPackages(await myRes.json());
    if (wRes.ok) setWallet(await wRes.json());
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

  const activePackage = myPackages.find(mp => mp.status === "active" && !mp.isExpired);

  if (loading) return <div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader title={t("pkg.title")} icon={Crown} gradient="from-amber-400 to-orange-600" />

      {/* Active package banner */}
      {activePackage && (
        <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-300/60 dark:border-amber-400/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="icon-tile rounded-xl p-2.5 bg-gradient-to-br from-amber-400 to-orange-600"><Crown className="w-5 h-5" /></div>
            <div className="flex-1">
              <p className="font-semibold">{activePackage.package.name}</p>
              <p className="text-sm text-muted-foreground">{t("pkg.expires")}: {new Date(activePackage.endDate).toLocaleDateString("th-TH")}</p>
            </div>
            <Badge className="bg-amber-500 text-white">{t("pkg.active")}</Badge>
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
              {owned && <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs px-3 py-1 rounded-bl-lg shadow-sm z-10">มีอยู่แล้ว</div>}
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
                {!owned && (
                  <Button className="w-full" onClick={() => setBuyPkg(pkg)}>
                    <ShoppingBag className="w-4 h-4 mr-2" />{t("pkg.buy")}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
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
