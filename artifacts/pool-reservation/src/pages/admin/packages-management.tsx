import { FC, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Crown, Calendar, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

type Package = { id: number; name: string; nameEn: string; description?: string; price: number; durationDays: number; benefits?: string; bookingDiscount: number; maxBookingsPerMonth?: number; isActive: boolean; sortOrder: number };

const empty = (): Omit<Package, "id"> => ({ name: "", nameEn: "", description: "", price: 0, durationDays: 30, benefits: "", bookingDiscount: 0, maxBookingsPerMonth: undefined, isActive: true, sortOrder: 0 });

export const AdminPackagesManagement: FC = () => {
  const { toast } = useToast();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"" | "add" | "edit">("");
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPackages = async () => {
    setLoading(true);
    const res = await fetch(`${baseUrl}/api/packages/all`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPackages(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchPackages(); }, []);

  const openAdd = () => { setForm(empty()); setDialog("add"); };
  const openEdit = (pkg: Package) => { setForm({ ...pkg }); setEditId(pkg.id); setDialog("edit"); };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.durationDays) { toast({ title: "กรุณากรอกข้อมูลให้ครบ", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = dialog === "edit" ? `${baseUrl}/api/packages/${editId}` : `${baseUrl}/api/packages`;
      const res = await fetch(url, {
        method: dialog === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: dialog === "edit" ? "อัปเดตสำเร็จ" : "เพิ่มแพ็กเกจสำเร็จ" });
      setDialog("");
      fetchPackages();
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (pkg: Package) => {
    await fetch(`${baseUrl}/api/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !pkg.isActive }),
    });
    fetchPackages();
  };

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="จัดการแพ็กเกจสมาชิก"
        icon={Crown}
        gradient="from-amber-400 to-orange-600"
        actions={<Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" />เพิ่มแพ็กเกจ</Button>}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : packages.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Crown className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>ยังไม่มีแพ็กเกจ</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map(pkg => (
            <Card key={pkg.id} className={!pkg.isActive ? "opacity-60" : ""}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold">{pkg.name}</h3>
                    <p className="text-xs text-muted-foreground">{pkg.nameEn}</p>
                  </div>
                  <Badge variant={pkg.isActive ? "default" : "secondary"}>{pkg.isActive ? "ใช้งาน" : "ปิด"}</Badge>
                </div>
                <p className="text-2xl font-display font-extrabold text-gradient">฿{pkg.price.toLocaleString()}</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{pkg.durationDays} วัน</div>
                  {pkg.bookingDiscount > 0 && <div className="flex items-center gap-1"><Percent className="w-3 h-3" />ส่วนลด {pkg.bookingDiscount}%</div>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(pkg)}><Pencil className="w-3 h-3 mr-1" />แก้ไข</Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(pkg)}>{pkg.isActive ? "ปิด" : "เปิด"}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog !== ""} onOpenChange={() => setDialog("")}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog === "edit" ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจใหม่"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([["name", "ชื่อ (ภาษาไทย)"], ["nameEn", "ชื่อ (English)"]] as const).map(([k, label]) => (
              <div key={k}><Label>{label}</Label><Input value={form[k] as string} onChange={f(k)} className="mt-1" /></div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ราคา (บาท)</Label><Input type="number" value={form.price} onChange={f("price")} className="mt-1" /></div>
              <div><Label>ระยะเวลา (วัน)</Label><Input type="number" value={form.durationDays} onChange={f("durationDays")} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ส่วนลดจอง (%)</Label><Input type="number" value={form.bookingDiscount} onChange={f("bookingDiscount")} className="mt-1" min={0} max={100} /></div>
              <div><Label>จองสูงสุด/เดือน</Label><Input type="number" value={form.maxBookingsPerMonth ?? ""} onChange={f("maxBookingsPerMonth")} placeholder="ไม่จำกัด" className="mt-1" /></div>
            </div>
            <div><Label>คำอธิบาย</Label><Textarea value={form.description || ""} onChange={f("description")} rows={2} className="mt-1" /></div>
            <div><Label>สิทธิพิเศษ (แต่ละบรรทัด = 1 รายการ)</Label><Textarea value={form.benefits || ""} onChange={f("benefits")} rows={3} className="mt-1" placeholder="เช่น&#10;เข้าได้ตลอด 24 ชม.&#10;จอดรถฟรี" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} />
              <Label>เปิดใช้งาน</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialog("")}>ยกเลิก</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
