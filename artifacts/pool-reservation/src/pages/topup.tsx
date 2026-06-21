import { FC, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Building2, QrCode, CheckCircle2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Method = "bank_transfer" | "qr_payment";

export const Topup: FC = () => {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const fileRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("bank_transfer");
  const [slip, setSlip] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetch(`${baseUrl}/api/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSettings).catch(() => {});
  }, []);

  const presets = [100, 200, 500, 1000, 2000, 5000];

  const handleSlip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "ไฟล์ใหญ่เกินไป (สูงสุด 5MB)", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = ev => setSlip(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!amount || Number(amount) < 1) { toast({ title: "กรุณากรอกจำนวนเงิน", variant: "destructive" }); return; }
    try {
      setLoading(true);
      const res = await fetch(`${baseUrl}/api/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: Number(amount), method, slipImageUrl: slip, note }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setSuccess(true);
    } catch (err: any) {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">ส่งคำขอสำเร็จ!</h2>
        <p className="text-muted-foreground">{t("topup.success")}</p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => setLocation("/wallet")} variant="outline">ดูกระเป๋าเงิน</Button>
        <Button onClick={() => { setSuccess(false); setAmount(""); setSlip(null); }}>เติมเงินอีกครั้ง</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/wallet")}><ChevronLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-display font-extrabold text-gradient">{t("topup.title")}</h1>
      </div>

      {/* Bank info */}
      {settings && (settings.bankName || settings.promptpayNumber) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 space-y-1">
            <p className="font-semibold text-sm">ข้อมูลการชำระเงิน</p>
            {settings.bankName && <p className="text-sm text-muted-foreground">ธนาคาร: {settings.bankName} · {settings.bankAccountNumber}</p>}
            {settings.bankAccountName && <p className="text-sm text-muted-foreground">ชื่อบัญชี: {settings.bankAccountName}</p>}
            {settings.promptpayNumber && <p className="text-sm text-muted-foreground">PromptPay: {settings.promptpayNumber}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Amount */}
          <div className="space-y-3">
            <Label>{t("topup.amount")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map(p => (
                <Button key={p} variant={amount === String(p) ? "default" : "outline"} size="sm" onClick={() => setAmount(String(p))}>
                  ฿{p.toLocaleString()}
                </Button>
              ))}
            </div>
            <Input type="number" placeholder="หรือกรอกจำนวนเอง" value={amount} onChange={e => setAmount(e.target.value)} min={1} />
          </div>

          {/* Method */}
          <div className="space-y-2">
            <Label>{t("topup.method")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {([["bank_transfer", "bank", Building2], ["qr_payment", "qr", QrCode]] as const).map(([val, key, Icon]) => (
                <button key={val} onClick={() => setMethod(val)}
                  className={cn("flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all",
                    method === val ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40")}>
                  <Icon className="w-4 h-4" />{t(`topup.method.${key}` as any)}
                </button>
              ))}
            </div>
          </div>

          {/* Slip upload */}
          <div className="space-y-2">
            <Label>{t("topup.slip")}</Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleSlip} />
            {slip ? (
              <div className="relative">
                <img src={slip} alt="slip" className="w-full max-h-48 object-contain rounded-lg border" />
                <Button variant="ghost" size="sm" className="absolute top-1 right-1" onClick={() => setSlip(null)}>✕</Button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                <Upload className="w-5 h-5" />
                <span className="text-sm">คลิกเพื่ออัปโหลดสลิป</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("topup.note")}</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)" rows={2} />
          </div>

          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={loading || !amount}>
            {loading ? "กำลังส่ง..." : t("topup.submit")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
