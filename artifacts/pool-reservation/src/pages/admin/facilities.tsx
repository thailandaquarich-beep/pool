import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Clock, Users, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type Facility = {
  id: number;
  name: string;
  nameEn: string;
  description: string | null;
  descriptionEn: string | null;
  capacity: number;
  openTime: string;
  closeTime: string;
  imageUrl: string | null;
  rules: string | null;
  slotDurationMinutes: number;
  location: string | null;
  phone: string | null;
  mapUrl: string | null;
  amenities: string | null;
  depth: string | null;
  lanes: number | null;
  priceInfo: string | null;
  isActive: boolean;
};

type FacilityForm = {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  capacity: number;
  openTime: string;
  closeTime: string;
  imageUrl: string;
  rules: string;
  slotDurationMinutes: number;
  location: string;
  phone: string;
  mapUrl: string;
  amenities: string;
  depth: string;
  lanes: string;
  priceInfo: string;
};

const emptyForm = (): FacilityForm => ({
  name: "", nameEn: "", description: "", descriptionEn: "",
  capacity: 20, openTime: "06:00", closeTime: "20:00",
  imageUrl: "", rules: "", slotDurationMinutes: 60,
  location: "", phone: "", mapUrl: "", amenities: "", depth: "", lanes: "", priceInfo: "",
});

export function AdminFacilities() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Facility | null>(null);
  const [form, setForm] = useState<FacilityForm>(emptyForm());

  const { data: facilities, isLoading } = useQuery<Facility[]>({
    queryKey: ["facilities"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/facilities/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch facilities");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FacilityForm) => {
      const res = await fetch(`${baseUrl}/api/facilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "เพิ่มสถานที่สำเร็จ" });
      qc.invalidateQueries({ queryKey: ["facilities"] });
      setAddOpen(false);
      setForm(emptyForm());
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FacilityForm & { isActive: boolean }> }) => {
      const res = await fetch(`${baseUrl}/api/facilities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "แก้ไขสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["facilities"] });
      setEditTarget(null);
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  function openEdit(f: Facility) {
    setForm({
      name: f.name, nameEn: f.nameEn,
      description: f.description ?? "", descriptionEn: f.descriptionEn ?? "",
      capacity: f.capacity, openTime: f.openTime, closeTime: f.closeTime,
      imageUrl: f.imageUrl ?? "", rules: f.rules ?? "", slotDurationMinutes: f.slotDurationMinutes ?? 60,
      location: f.location ?? "", phone: f.phone ?? "", mapUrl: f.mapUrl ?? "",
      amenities: f.amenities ?? "", depth: f.depth ?? "", lanes: f.lanes != null ? String(f.lanes) : "",
      priceInfo: f.priceInfo ?? "",
    });
    setEditTarget(f);
  }

  const set = <K extends keyof FacilityForm>(k: K, v: FacilityForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const FormBody = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>ชื่อ (ไทย) *</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="เช่น สระว่ายน้ำ" />
        </div>
        <div className="space-y-1.5">
          <Label>ชื่อ (อังกฤษ) *</Label>
          <Input value={form.nameEn} onChange={e => set("nameEn", e.target.value)} placeholder="e.g. Swimming Pool" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>คำอธิบาย (ไทย)</Label>
        <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>คำอธิบาย (อังกฤษ)</Label>
        <Textarea value={form.descriptionEn} onChange={e => set("descriptionEn", e.target.value)} rows={2} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>ความจุ (คน)</Label>
          <Input type="number" min={1} value={form.capacity} onChange={e => set("capacity", parseInt(e.target.value) || 1)} />
        </div>
        <div className="space-y-1.5">
          <Label>เวลาเปิด</Label>
          <Input type="time" value={form.openTime} onChange={e => set("openTime", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>เวลาปิด</Label>
          <Input type="time" value={form.closeTime} onChange={e => set("closeTime", e.target.value)} />
        </div>
      </div>

      {/* Extended details */}
      <div className="space-y-1.5">
        <Label>รูปภาพ (URL)</Label>
        <Input value={form.imageUrl} onChange={e => set("imageUrl", e.target.value)} placeholder="https://..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>ที่ตั้ง</Label>
          <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="เช่น ชั้น 2 อาคาร A" />
        </div>
        <div className="space-y-1.5">
          <Label>เบอร์ติดต่อ</Label>
          <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="0XX-XXX-XXXX" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>ลิงก์แผนที่ (Google Maps)</Label>
        <Input value={form.mapUrl} onChange={e => set("mapUrl", e.target.value)} placeholder="https://maps.google.com/..." />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>ความลึก</Label>
          <Input value={form.depth} onChange={e => set("depth", e.target.value)} placeholder="เช่น 1.2–1.8 ม." />
        </div>
        <div className="space-y-1.5">
          <Label>จำนวนเลน</Label>
          <Input type="number" min={0} value={form.lanes} onChange={e => set("lanes", e.target.value)} placeholder="เช่น 6" />
        </div>
        <div className="space-y-1.5">
          <Label>ระยะเวลา/รอบ (นาที)</Label>
          <Input type="number" min={15} step={15} value={form.slotDurationMinutes} onChange={e => set("slotDurationMinutes", parseInt(e.target.value) || 60)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>ค่าบริการ</Label>
        <Input value={form.priceInfo} onChange={e => set("priceInfo", e.target.value)} placeholder="เช่น สมาชิกฟรี / บุคคลทั่วไป 50 บาท" />
      </div>
      <div className="space-y-1.5">
        <Label>สิ่งอำนวยความสะดวก</Label>
        <Textarea value={form.amenities} onChange={e => set("amenities", e.target.value)} rows={2} placeholder="เช่น ห้องอาบน้ำ, ล็อกเกอร์, ที่จอดรถ" />
      </div>
      <div className="space-y-1.5">
        <Label>กฎการใช้บริการ</Label>
        <Textarea value={form.rules} onChange={e => set("rules", e.target.value)} rows={2} placeholder="เช่น สวมหมวกว่ายน้ำทุกครั้ง" />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="จัดการสถานที่"
        subtitle="สถานที่ออกกำลังกายและกิจกรรมทั้งหมด"
        icon={Building2}
        gradient="from-cyan-400 to-teal-600"
        actions={
          <Button onClick={() => { setForm(emptyForm()); setAddOpen(true); }} className="gap-2" data-testid="add-facility-btn">
            <Plus className="w-4 h-4" /> เพิ่มสถานที่
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !facilities?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีสถานที่</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {facilities.map((fac) => (
            <Card key={fac.id} className={`overflow-hidden transition-all ${!fac.isActive ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">{fac.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{fac.nameEn}</p>
                  </div>
                  <Building2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {fac.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{fac.description}</p>
                )}
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{fac.capacity} คน</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fac.openTime}–{fac.closeTime}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <Badge variant={fac.isActive ? "default" : "secondary"} className="text-xs">
                    {fac.isActive ? "เปิดให้บริการ" : "ปิดชั่วคราว"}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={fac.isActive}
                      onCheckedChange={v => updateMutation.mutate({ id: fac.id, data: { isActive: v } })}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(fac)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มสถานที่ใหม่</DialogTitle></DialogHeader>
          <FormBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button
              disabled={createMutation.isPending || !form.name || !form.nameEn}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending ? "กำลังบันทึก..." : "เพิ่มสถานที่"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>แก้ไขสถานที่</DialogTitle></DialogHeader>
          <FormBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => editTarget && updateMutation.mutate({ id: editTarget.id, data: form })}
            >
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
