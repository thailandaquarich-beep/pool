import { FC, useState, useEffect } from "react";
import { Link } from "wouter";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Plus, History, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type WalletData = { id: number; userId: number; balance: number };
type Transaction = {
  id: number; userId: number; amount: number; type: string;
  description: string; status: string; createdAt: string;
};

export const WalletPage: FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wRes, tRes] = await Promise.all([
        fetch(`${baseUrl}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${baseUrl}/api/wallet/transactions?limit=20`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (wRes.ok) setWallet(await wRes.json());
      if (tRes.ok) { const d = await tRes.json(); setTransactions(d.transactions || []); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const typeIcon = (type: string) => {
    if (["topup", "admin_credit", "booking_refund"].includes(type)) return <ArrowUpCircle className="w-4 h-4 text-emerald-500" />;
    return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
  };

  const typeLabel: Record<string, string> = {
    topup: "เติมเงิน", booking_payment: "ชำระค่าจอง", booking_refund: "คืนเงินจอง",
    package_purchase: "ซื้อแพ็กเกจ", admin_credit: "แอดมินเติมเงิน", admin_debit: "แอดมินหักเงิน",
  };

  if (loading) return <div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-extrabold text-gradient">{t("wallet.title")}</h1>
        <Button asChild>
          <Link href="/topup"><Plus className="w-4 h-4 mr-2" />{t("wallet.topup")}</Link>
        </Button>
      </div>

      {/* Balance card */}
      <Card className="bg-brand bg-brand-animated text-white border-none shadow-xl glow sheen relative overflow-hidden">
        <CardContent className="p-8 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/20 rounded-full">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-white/80 text-sm">{t("wallet.balance")}</p>
              <p className="text-white/60 text-xs">{user?.firstName} {user?.lastName}</p>
            </div>
          </div>
          <p className="text-4xl font-bold tracking-tight">
            ฿{(wallet?.balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-16 flex-col gap-1" asChild>
          <Link href="/topup">
            <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">{t("wallet.topup")}</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-16 flex-col gap-1" asChild>
          <Link href="/packages">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm">{t("pkg.title")}</span>
          </Link>
        </Button>
      </div>

      {/* Transaction history */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          <CardTitle className="text-base">{t("wallet.history")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("wallet.noHistory")}</p>
          ) : (
            <div className="divide-y">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-4">
                  <div className="p-2 bg-muted rounded-full">{typeIcon(tx.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel[tx.type] || tx.type} · {new Date(tx.createdAt).toLocaleDateString("th-TH")}</p>
                  </div>
                  <p className={cn("font-semibold text-sm whitespace-nowrap", ["topup","admin_credit","booking_refund"].includes(tx.type) ? "text-emerald-600" : "text-red-500")}>
                    {["topup","admin_credit","booking_refund"].includes(tx.type) ? "+" : "-"}฿{tx.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
