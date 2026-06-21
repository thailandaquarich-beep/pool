import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { ShoppingBag, Plus, Pencil, Trash2, Minus } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { cn } from "@/lib/utils";

type Product = {
  id: number; name: string; nameEn: string | null; category: string | null; description: string | null;
  price: number; imageUrl: string | null; stock: number | null; isActive: boolean; sortOrder: number;
};
type Form = {
  name: string; nameEn: string; category: string; description: string;
  price: string; imageUrl: string; stock: string; sortOrder: string;
};
const emptyForm = (): Form => ({ name: "", nameEn: "", category: "", description: "", price: "0", imageUrl: "", stock: "", sortOrder: "0" });

export function AdminProducts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["products", "all"],
    refetchInterval: 15000, // near real-time stock view
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/products/all`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Quick stock +/- adjust (sends the resulting absolute value)
  const adjustStock = useMutation({
    mutationFn: async ({ id, stock }: { id: number; stock: number }) => {
      const res = await fetch(`${baseUrl}/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stock }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: () => toast({ title: "ปรับสต็อกไม่สำเร็จ", variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async ({ id, data }: { id?: number; data: Form }) => {
      const res = await fetch(`${baseUrl}/api/products${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["products"] });
      setAddOpen(false); setEditTarget(null); setForm(emptyForm());
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`${baseUrl}/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${baseUrl}/api/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => { toast({ title: "ลบผลิตภัณฑ์แล้ว" }); qc.invalidateQueries({ queryKey: ["products"] }); setDeleteTarget(null); },
    onError: (e: any) => toast({ title: e.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  function openEdit(p: Product) {
    setForm({
      name: p.name, nameEn: p.nameEn ?? "", category: p.category ?? "", description: p.description ?? "",
      price: String(p.price), imageUrl: p.imageUrl ?? "", stock: p.stock != null ? String(p.stock) : "", sortOrder: String(p.sortOrder),
    });
    setEditTarget(p);
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const FormBody = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>ชื่อสินค้า *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="เช่น แว่นว่ายน้ำ" /></div>
        <div className="space-y-1.5"><Label>ชื่อ (อังกฤษ)</Label><Input value={form.nameEn} onChange={e => set("nameEn", e.target.value)} placeholder="Goggles" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>หมวดหมู่</Label><Input value={form.category} onChange={e => set("category", e.target.value)} placeholder="เช่น อุปกรณ์ว่ายน้ำ" /></div>
        <div className="space-y-1.5"><Label>ราคา (บาท)</Label><Input type="number" min={0} value={form.price} onChange={e => set("price", e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label>คำอธิบาย</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} /></div>
      <div className="space-y-1.5"><Label>รูปภาพสินค้า</Label><ImageUpload value={form.imageUrl} onChange={(v) => set("imageUrl", v ?? "")} shape="wide" maxMb={5} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>สต็อก (เว้นว่าง = ไม่จำกัด)</Label><Input type="number" min={0} value={form.stock} onChange={e => set("stock", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>ลำดับการแสดง</Label><Input type="number" value={form.sortOrder} onChange={e => set("sortOrder", e.target.value)} /></div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="จัดการผลิตภัณฑ์"
        subtitle="สินค้าและบริการที่จำหน่าย"
        icon={ShoppingBag}
        gradient="from-fuchsia-400 to-pink-600"
        actions={
          <Button onClick={() => { setForm(emptyForm()); setAddOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> เพิ่มผลิตภัณฑ์
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : !products?.length ? (
        <div className="text-center py-16 text-muted-foreground"><ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>ยังไม่มีผลิตภัณฑ์</p></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className={cn("overflow-hidden", !p.isActive && "opacity-60")}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 bg-muted flex items-center justify-center"><ShoppingBag className="w-10 h-10 text-muted-foreground/40" /></div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{p.name}</div>
                    {p.category && <Badge variant="outline" className="text-[10px] mt-0.5">{p.category}</Badge>}
                  </div>
                  <div className="text-lg font-bold text-primary shrink-0">฿{p.price.toLocaleString()}</div>
                </div>
                {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                {/* Stock with quick +/- adjust */}
                {p.stock != null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">สต็อก:</span>
                    <Button size="icon" variant="outline" className="h-6 w-6" disabled={adjustStock.isPending || p.stock <= 0} onClick={() => adjustStock.mutate({ id: p.id, stock: p.stock! - 1 })}><Minus className="w-3 h-3" /></Button>
                    <span className={cn("text-sm font-bold w-9 text-center tabular-nums", p.stock <= 0 ? "text-destructive" : p.stock <= 5 ? "text-amber-600" : "")}>{p.stock}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6" disabled={adjustStock.isPending} onClick={() => adjustStock.mutate({ id: p.id, stock: p.stock! + 1 })}><Plus className="w-3 h-3" /></Button>
                    {p.stock <= 0 && <Badge variant="destructive" className="text-[10px]">สินค้าหมด</Badge>}
                    {p.stock > 0 && p.stock <= 5 && <Badge className="text-[10px] bg-amber-500 text-white">ใกล้หมด</Badge>}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">สต็อก: ไม่จำกัด</div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <Switch checked={p.isActive} onCheckedChange={v => toggleActive.mutate({ id: p.id, isActive: v })} />
                    <span className="text-xs text-muted-foreground">{p.isActive ? "ขายอยู่" : "ปิดขาย"}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มผลิตภัณฑ์ใหม่</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button disabled={save.isPending || !form.name} onClick={() => save.mutate({ data: form })}>{save.isPending ? "กำลังบันทึก..." : "เพิ่ม"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>แก้ไขผลิตภัณฑ์</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button disabled={save.isPending} onClick={() => editTarget && save.mutate({ id: editTarget.id, data: form })}>{save.isPending ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบผลิตภัณฑ์</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบ <span className="font-semibold">{deleteTarget?.name}</span> ออกถาวร? การกระทำนี้ย้อนกลับไม่ได้ (ถ้าต้องการแค่ซ่อนชั่วคราว ให้ปิดสวิตช์ "ขายอยู่" แทน)</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); deleteTarget && remove.mutate(deleteTarget.id); }} disabled={remove.isPending}>{remove.isPending ? "กำลังลบ..." : "ลบถาวร"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
