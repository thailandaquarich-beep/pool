import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Camera, CameraOff, UserCheck, CheckCircle2, XCircle, Ticket, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type LookupData = {
  code: string;
  user: { id: number; firstName: string; lastName: string; houseNumber: string | null };
  hasQuota: boolean;
  totalRemaining: number | null;
  packageName: string | null;
};
type ResultData = {
  ok: boolean;
  message: string;
  user?: { firstName: string; lastName: string };
  remainingAfter?: number | null;
  packageName?: string | null;
};

const ELEMENT_ID = "qr-reader";

export function AdminCheckinScan() {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [lookup, setLookup] = useState<LookupData | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [busy, setBusy] = useState(false);

  async function stopScanner() {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); } catch { /* already stopped */ }
      try { await s.clear(); } catch { /* noop */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => {
    return () => { void stopScanner(); };
  }, []);

  async function startScanner() {
    setResult(null);
    setLookup(null);
    try {
      const s = new Html5Qrcode(ELEMENT_ID);
      scannerRef.current = s;
      setScanning(true);
      await s.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          await stopScanner();
          void doLookup(decoded);
        },
        () => { /* ignore per-frame decode errors */ },
      );
    } catch {
      setScanning(false);
      toast({ title: "เปิดกล้องไม่ได้", description: "อนุญาตการใช้กล้อง หรือใช้การกรอกรหัสด้านล่าง", variant: "destructive" });
    }
  }

  async function doLookup(code: string) {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${baseUrl}/api/checkin/lookup?token=${encodeURIComponent(c)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setLookup(null);
        toast({ title: "ไม่พบสมาชิก", description: data.error, variant: "destructive" });
      } else {
        setLookup({ ...data, code: c });
      }
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmCheckin() {
    if (!lookup?.code) return;
    setBusy(true);
    try {
      const res = await fetch(`${baseUrl}/api/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: lookup.code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error, user: data.user });
      } else {
        setResult({ ok: true, message: data.message, user: data.user, remainingAfter: data.remainingAfter, packageName: data.packageName });
      }
      setLookup(null);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-gradient flex items-center gap-2">
          <QrCode className="w-6 h-6 text-primary" /> สแกนเช็คอิน
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">สแกน QR ของสมาชิกเพื่อหักสิทธิ์การใช้งาน 1 ครั้ง</p>
      </div>

      {/* Camera */}
      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div id={ELEMENT_ID} className={cn("w-full rounded-xl overflow-hidden bg-black/90 mx-auto", !scanning && "hidden")} />
          {!scanning && (
            <div className="aspect-square w-full rounded-xl bg-muted/50 border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Camera className="w-10 h-10 opacity-40" />
              <span className="text-sm">กดเปิดกล้องเพื่อเริ่มสแกน</span>
            </div>
          )}
          {scanning ? (
            <Button variant="outline" className="w-full gap-2" onClick={() => void stopScanner()}>
              <CameraOff className="w-4 h-4" /> ปิดกล้อง
            </Button>
          ) : (
            <Button className="w-full gap-2" onClick={() => void startScanner()}>
              <Camera className="w-4 h-4" /> เปิดกล้องสแกน
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Manual */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">หรือกรอกรหัสจาก QR</label>
          <div className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="วางรหัสเช็คอิน..." onKeyDown={(e) => e.key === "Enter" && doLookup(manual)} />
            <Button variant="outline" disabled={busy || !manual.trim()} onClick={() => doLookup(manual)} className="gap-1.5 shrink-0">
              <Search className="w-4 h-4" /> ค้นหา
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lookup preview -> confirm */}
      {lookup && (
        <Card className="rounded-2xl border-primary/40 ring-2 ring-primary/10">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                {lookup.user.firstName?.[0]}{lookup.user.lastName?.[0]}
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg">{lookup.user.firstName} {lookup.user.lastName}</div>
                <div className="text-xs text-muted-foreground">บ้านเลขที่ {lookup.user.houseNumber ?? "-"}</div>
              </div>
            </div>
            <div className="rounded-xl bg-secondary/40 p-3 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{lookup.packageName ?? "ไม่มีแพ็กเกจ"}</span>
              <span className={cn("font-bold", lookup.hasQuota ? "text-primary" : "text-destructive")}>
                คงเหลือ {lookup.totalRemaining === null ? "ไม่จำกัด" : `${lookup.totalRemaining} ครั้ง`}
              </span>
            </div>
            <Button className="w-full gap-2 min-h-[48px]" disabled={busy || !lookup.hasQuota} onClick={confirmCheckin}>
              <UserCheck className="w-5 h-5" /> {lookup.hasQuota ? "ยืนยันเช็คอิน (หัก 1 ครั้ง)" : "ไม่มีสิทธิ์คงเหลือ"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className={cn("rounded-2xl", result.ok ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-destructive/40 bg-destructive/5")}>
          <CardContent className="p-5 text-center space-y-2">
            {result.ok ? <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" /> : <XCircle className="w-12 h-12 text-destructive mx-auto" />}
            <div className="font-bold text-lg">{result.message}</div>
            {result.user && <div className="text-sm">{result.user.firstName} {result.user.lastName}</div>}
            {result.ok && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                <Ticket className="w-4 h-4" /> คงเหลือ {result.remainingAfter === null ? "ไม่จำกัด" : `${result.remainingAfter} ครั้ง`}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
