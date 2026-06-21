import { FC, useState, type ReactNode, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Trash2, Users, Star, Pencil, Phone, Mail, MapPin, Clock,
  Hash, User as UserIcon, MessageSquare, Save,
} from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

type Branch = {
  id: number; name: string; nameEn: string | null; code: string | null;
  address: string | null; phone: string | null; ownerName: string | null;
  email: string | null; lineId: string | null; taxId: string | null;
  openTime: string | null; closeTime: string | null; logoUrl: string | null; note: string | null;
  isActive: boolean; isMain: boolean; memberCount?: number;
};

type Form = {
  name: string; nameEn: string; code: string; ownerName: string; phone: string; email: string;
  lineId: string; taxId: string; openTime: string; closeTime: string; address: string; logoUrl: string; note: string;
};
const emptyForm: Form = {
  name: "", nameEn: "", code: "", ownerName: "", phone: "", email: "",
  lineId: "", taxId: "", openTime: "", closeTime: "", address: "", logoUrl: "", note: "",
};
const toForm = (b: Branch): Form => ({
  name: b.name || "", nameEn: b.nameEn || "", code: b.code || "", ownerName: b.ownerName || "",
  phone: b.phone || "", email: b.email || "", lineId: b.lineId || "", taxId: b.taxId || "",
  openTime: b.openTime || "", closeTime: b.closeTime || "", address: b.address || "", logoUrl: b.logoUrl || "", note: b.note || "",
});

const Field: FC<{ label: string; icon?: any; children: ReactNode; full?: boolean }> = ({ label, icon: Icon, children, full }) => (
  <div className={full ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
    <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">{Icon && <Icon className="w-3.5 h-3.5" />}{label}</Label>
    {children}
  </div>
);

export const AdminBranches: FC = () => {
  const token = localStorage.getItem("pool_token");
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ["branches"],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/branches`, { headers: auth });
      return r.ok ? r.json() : [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["branches"] });
  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openNew = () => { setForm(emptyForm); setEditing("new"); };
  const openEdit = (b: Branch) => { setForm(toForm(b)); setEditing(b); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "กรุณากรอกชื่อสาขา", variant: "destructive" }); return; }
    setBusy(true);
    const isNew = editing === "new";
    const url = isNew ? `${baseUrl}/api/branches` : `${baseUrl}/api/branches/${(editing as Branch).id}`;
    const r = await fetch(url, { method: isNew ? "POST" : "PATCH", headers: auth, body: JSON.stringify(form) });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast({ title: j.error || "บันทึกไม่สำเร็จ", variant: "destructive" }); return; }
    toast({ title: isNew ? `เพิ่มสาขา "${form.name}" แล้ว` : "บันทึกข้อมูลสาขาแล้ว" });
    setEditing(null);
    refresh();
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    const r = await fetch(`${baseUrl}/api/branches/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify(body) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast({ title: j.error || "แก้ไขไม่สำเร็จ", variant: "destructive" }); }
    refresh();
  };

  const del = async (b: Branch) => {
    if (!window.confirm(`ลบสาขา "${b.name}"? การลบไม่สามารถย้อนกลับได้`)) return;
    const r = await fetch(`${baseUrl}/api/branches/${b.id}`, { method: "DELETE", headers: auth });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast({ title: j.error || "ลบไม่สำเร็จ", variant: "destructive" }); return; }
    toast({ title: "ลบสาขาแล้ว" });
    refresh();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl icon-tile bg-gold flex items-center justify-center"><Building2 className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">จัดการสาขา (แฟรนไชส์)</h1>
            <p className="text-sm text-muted-foreground">แต่ละสาขาแยกข้อมูลกันอิสระ — สมาชิก สระ แพ็กเกจ สินค้า ของใครของมัน</p>
          </div>
        </div>
        <Button onClick={openNew} className="h-10 rounded-xl bg-gradient-to-r from-primary to-cyan-500 text-white font-semibold gap-2 shadow-lg shadow-primary/25">
          <Plus className="w-4 h-4" /> เพิ่มสาขา
        </Button>
      </div>

      {/* Branch cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {(branches || []).map((b) => (
          <Card key={b.id} className="glass rounded-2xl border-none shadow-lg card-lift">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {b.logoUrl
                    ? <img src={b.logoUrl} alt="" className="w-11 h-11 rounded-xl object-cover ring-1 ring-border shrink-0" />
                    : <div className="w-11 h-11 rounded-xl icon-tile bg-brand flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></div>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-lg truncate">{b.name}</h3>
                      {b.isMain && <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft text-[hsl(var(--gold-deep))] text-[10px] font-bold px-2 py-0.5 shrink-0"><Star className="w-3 h-3" /> หลัก</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {b.code ? `รหัส ${b.code}` : "ไม่มีรหัส"}{b.nameEn ? ` · ${b.nameEn}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10" title="แก้ไข"><Pencil className="w-4 h-4" /></button>
                  {!b.isMain && <button onClick={() => del(b)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="ลบ"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="w-4 h-4 text-gold" /> {b.memberCount ?? 0} สมาชิก</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">{b.isActive ? "เปิดใช้งาน" : "ปิด"}<Switch checked={b.isActive} onCheckedChange={(v) => patch(b.id, { isActive: v })} /></label>
              </div>

              {(b.ownerName || b.phone || b.email || b.openTime || b.address) && (
                <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground grid grid-cols-1 gap-1">
                  {b.ownerName && <div className="inline-flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" /> {b.ownerName}</div>}
                  {b.phone && <div className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {b.phone}</div>}
                  {b.email && <div className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {b.email}</div>}
                  {(b.openTime || b.closeTime) && <div className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {b.openTime || "—"} – {b.closeTime || "—"}</div>}
                  {b.address && <div className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{b.address}</span></div>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gold" /> {editing === "new" ? "เพิ่มสาขาใหม่" : `แก้ไขสาขา: ${(editing as Branch)?.name ?? ""}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* General */}
            <div>
              <div className="text-xs font-semibold text-primary mb-2">ข้อมูลทั่วไป</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="ชื่อสาขา *"><Input value={form.name} onChange={set("name")} className="h-10 rounded-xl" placeholder="เช่น สาขารัชดา" /></Field>
                <Field label="ชื่อ (อังกฤษ)"><Input value={form.nameEn} onChange={set("nameEn")} className="h-10 rounded-xl" placeholder="Ratchada Branch" /></Field>
                <Field label="รหัสสาขา" icon={Hash}><Input value={form.code} onChange={set("code")} className="h-10 rounded-xl" placeholder="BKK01" /></Field>
                <Field label="ผู้ดูแล / เจ้าของสาขา" icon={UserIcon}><Input value={form.ownerName} onChange={set("ownerName")} className="h-10 rounded-xl" /></Field>
              </div>
            </div>

            {/* Contact */}
            <div>
              <div className="text-xs font-semibold text-primary mb-2">ข้อมูลติดต่อ</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="เบอร์โทร" icon={Phone}><Input value={form.phone} onChange={set("phone")} className="h-10 rounded-xl" /></Field>
                <Field label="อีเมล" icon={Mail}><Input type="email" value={form.email} onChange={set("email")} className="h-10 rounded-xl" /></Field>
                <Field label="LINE ID" icon={MessageSquare}><Input value={form.lineId} onChange={set("lineId")} className="h-10 rounded-xl" /></Field>
                <Field label="เลขผู้เสียภาษี" icon={Hash}><Input value={form.taxId} onChange={set("taxId")} className="h-10 rounded-xl" /></Field>
                <Field label="ที่อยู่" icon={MapPin} full><Textarea value={form.address} onChange={set("address")} className="rounded-xl min-h-16" /></Field>
              </div>
            </div>

            {/* Hours & misc */}
            <div>
              <div className="text-xs font-semibold text-primary mb-2">เวลาทำการ & อื่นๆ</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="เวลาเปิด" icon={Clock}><Input type="time" value={form.openTime} onChange={set("openTime")} className="h-10 rounded-xl" /></Field>
                <Field label="เวลาปิด" icon={Clock}><Input type="time" value={form.closeTime} onChange={set("closeTime")} className="h-10 rounded-xl" /></Field>
                <Field label="โลโก้สาขา (URL)" full><Input value={form.logoUrl} onChange={set("logoUrl")} className="h-10 rounded-xl" placeholder="https://..." /></Field>
                <Field label="หมายเหตุ" icon={MessageSquare} full><Textarea value={form.note} onChange={set("note")} className="rounded-xl min-h-16" /></Field>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} className="rounded-xl">ยกเลิก</Button>
            <Button onClick={save} disabled={busy} className="rounded-xl bg-gradient-to-r from-primary to-cyan-500 text-white font-semibold gap-2">
              <Save className="w-4 h-4" /> {busy ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
