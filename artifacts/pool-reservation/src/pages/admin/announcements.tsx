import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Bell, Plus, Pin, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

type Announcement = {
  id: number;
  title: string;
  titleEn: string | null;
  content: string;
  contentEn: string | null;
  type: "info" | "warning" | "success" | "maintenance";
  isPublished: boolean;
  isPinned: boolean;
  createdAt: string;
};

type AnnForm = {
  title: string;
  titleEn: string;
  content: string;
  contentEn: string;
  type: "info" | "warning" | "success" | "maintenance";
  isPinned: boolean;
};

const emptyForm = (): AnnForm => ({
  title: "", titleEn: "", content: "", contentEn: "", type: "info", isPinned: false,
});

const typeConfig = {
  info: { label: "ข้อมูล", className: "bg-blue-500" },
  warning: { label: "คำเตือน", className: "bg-amber-500" },
  success: { label: "ข่าวดี", className: "bg-emerald-500" },
  maintenance: { label: "ปิดปรับปรุง", className: "bg-slate-500" },
};

export function AdminAnnouncements() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnForm>(emptyForm());

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/announcements/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AnnForm) => {
      const res = await fetch(`${baseUrl}/api/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...data, isPublished: true }),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "เพิ่มประกาศสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setAddOpen(false);
      setForm(emptyForm());
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AnnForm & { isPublished: boolean }> }) => {
      const res = await fetch(`${baseUrl}/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "แก้ไขสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setEditTarget(null);
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${baseUrl}/api/announcements/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ลบประกาศสำเร็จ" });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  function openEdit(ann: Announcement) {
    setForm({
      title: ann.title, titleEn: ann.titleEn ?? "",
      content: ann.content, contentEn: ann.contentEn ?? "",
      type: ann.type, isPinned: ann.isPinned,
    });
    setEditTarget(ann);
  }

  const set = <K extends keyof AnnForm>(k: K, v: AnnForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const FormBody = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>หัวข้อ (ไทย) *</Label>
          <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="หัวข้อประกาศ" />
        </div>
        <div className="space-y-1.5">
          <Label>หัวข้อ (อังกฤษ)</Label>
          <Input value={form.titleEn} onChange={e => set("titleEn", e.target.value)} placeholder="Announcement Title" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>เนื้อหา (ไทย) *</Label>
        <Textarea value={form.content} onChange={e => set("content", e.target.value)} rows={3} placeholder="รายละเอียดประกาศ" />
      </div>
      <div className="space-y-1.5">
        <Label>เนื้อหา (อังกฤษ)</Label>
        <Textarea value={form.contentEn} onChange={e => set("contentEn", e.target.value)} rows={3} placeholder="Announcement details" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>ประเภท</Label>
          <Select value={form.type} onValueChange={v => set("type", v as AnnForm["type"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">ข้อมูล</SelectItem>
              <SelectItem value="warning">คำเตือน</SelectItem>
              <SelectItem value="success">ข่าวดี</SelectItem>
              <SelectItem value="maintenance">ปิดปรับปรุง</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>ปักหมุด</Label>
          <div className="flex items-center gap-3 h-10">
            <Switch checked={form.isPinned} onCheckedChange={v => set("isPinned", v)} />
            <span className="text-sm text-muted-foreground">{form.isPinned ? "ปักหมุดแล้ว" : "ไม่ปักหมุด"}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="ประกาศ"
        subtitle="ข้อความแจ้งสมาชิกทุกคน"
        icon={Bell}
        gradient="from-amber-400 to-orange-600"
        actions={
          <Button onClick={() => { setForm(emptyForm()); setAddOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> เพิ่มประกาศ
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !announcements?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีประกาศ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(ann => {
            const tc = typeConfig[ann.type] ?? typeConfig.info;
            return (
              <Card key={ann.id} className={cn("overflow-hidden transition-all", ann.isPinned && "border-primary/50", !ann.isPublished && "opacity-60")}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("text-white text-xs", tc.className)}>{tc.label}</Badge>
                      {ann.isPinned && (
                        <span className="flex items-center gap-1 text-xs text-primary font-medium">
                          <Pin className="w-3 h-3" /> ปักหมุด
                        </span>
                      )}
                      {!ann.isPublished && (
                        <span className="text-xs text-muted-foreground">(ซ่อนอยู่)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title={ann.isPublished ? "ซ่อน" : "เผยแพร่"}
                        onClick={() => updateMutation.mutate({ id: ann.id, data: { isPublished: !ann.isPublished } })}>
                        {ann.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(ann)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(ann)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-foreground mt-1">{ann.title}</h3>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">{ann.content}</p>
                  <p className="text-xs text-muted-foreground/60 mt-2">
                    {new Date(ann.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มประกาศใหม่</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button disabled={createMutation.isPending || !form.title || !form.content} onClick={() => createMutation.mutate(form)}>
              {createMutation.isPending ? "กำลังบันทึก..." : "เพิ่มประกาศ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>แก้ไขประกาศ</DialogTitle></DialogHeader>
          {FormBody()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button disabled={updateMutation.isPending} onClick={() => editTarget && updateMutation.mutate({ id: editTarget.id, data: form })}>
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบประกาศ</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบประกาศ "<span className="font-semibold">{deleteTarget?.title}</span>"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? "กำลังลบ..." : "ลบ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
