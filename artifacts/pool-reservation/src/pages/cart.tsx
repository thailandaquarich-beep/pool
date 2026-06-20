import { FC, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { ThaiAddressInput, ThaiAddress } from "@/components/thai-address-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Minus, Plus, Trash2, Upload, CheckCircle2, MapPin, User, Phone } from "lucide-react";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export const Cart: FC = () => {
  const { items, setQty, remove, clear, total } = useCart();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const fileRef = useRef<HTMLInputElement>(null);

  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addr, setAddr] = useState<ThaiAddress>({ subdistrict: "", district: "", province: "", zipcode: "" });
  const [slip, setSlip] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);

  const handleSlip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "ไฟล์ใหญ่เกินไป (สูงสุด 5MB)", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setSlip(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!items.length) return;
    if (!recipientName.trim() || !phone.trim() || !address.trim()) { toast({ title: "กรุณากรอกชื่อผู้รับ เบอร์โทร และที่อยู่", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
          recipientName, phone, address, ...addr, slipImageUrl: slip, note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "สั่งซื้อไม่สำเร็จ");
      clear();
      setSuccess(data);
    } catch (e: any) {
      toast({ title: e.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-5">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-10 h-10 text-emerald-600" /></div>
      <div>
        <h2 className="text-2xl font-bold">สั่งซื้อสำเร็จ!</h2>
        <p className="text-muted-foreground mt-1">เลขที่คำสั่งซื้อ #{success.id} · {success.status === "paid" ? "ชำระเงินแล้ว รอจัดส่ง" : "รอชำระเงิน"}</p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/products")}>เลือกซื้อต่อ</Button>
        <Button onClick={() => navigate("/my-orders")}>ดูคำสั่งซื้อของฉัน</Button>
      </div>
    </div>
  );

  if (!items.length) return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center text-muted-foreground space-y-4">
      <ShoppingCart className="w-14 h-14 opacity-30" />
      <p>ตะกร้าว่างเปล่า</p>
      <Button onClick={() => navigate("/products")}>เลือกซื้อสินค้า</Button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-extrabold flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-primary" /> ตะกร้าสินค้า</h1>

      {/* Items */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {items.map((i) => (
            <div key={i.productId} className="flex items-center gap-3">
              {i.imageUrl ? <img src={i.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-muted-foreground/40" /></div>}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{i.name}</div>
                <div className="text-sm text-primary font-semibold">{baht(i.price)}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.productId, i.qty - 1)}><Minus className="w-3.5 h-3.5" /></Button>
                <span className="w-7 text-center font-semibold">{i.qty}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.productId, i.qty + 1)}><Plus className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(i.productId)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <span className="font-medium">ยอดรวม</span>
            <span className="text-xl font-bold text-primary">{baht(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Recipient + address */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> ที่อยู่จัดส่ง</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><User className="w-3 h-3" />ชื่อผู้รับ *</Label><Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />เบอร์โทร *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">บ้านเลขที่ / หมู่ / ถนน *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="เช่น 123/4 หมู่ 5 ถนนสุขุมวิท" /></div>
          <ThaiAddressInput value={addr} onChange={setAddr} />
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="font-semibold">ชำระเงิน</h2>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleSlip} />
          {slip ? (
            <div className="relative">
              <img src={slip} alt="slip" className="w-full max-h-56 object-contain rounded-lg border" />
              <Button variant="ghost" size="sm" className="absolute top-1 right-1" onClick={() => setSlip(null)}>✕</Button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="w-full h-24 border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
              <Upload className="w-5 h-5" /><span className="text-sm">อัปโหลดสลิปการโอน (ถ้ามี)</span>
            </button>
          )}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="หมายเหตุถึงร้าน (ถ้ามี)" />
          <Button className="w-full" size="lg" onClick={submit} disabled={loading}>
            {loading ? "กำลังสั่งซื้อ..." : `ยืนยันการสั่งซื้อ · ${baht(total)}`}
          </Button>
          <p className="text-xs text-muted-foreground text-center">แนบสลิป = ชำระเงินแล้ว · ไม่แนบ = แจ้งชำระภายหลังได้</p>
        </CardContent>
      </Card>
    </div>
  );
};
