import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, Clock, Users, AlertTriangle, CheckCircle2, Save, CreditCard, MessageSquare, Banknote } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type SettingsForm = {
  bookingEnabled: boolean;
  bookingAutoConfirm: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  openTime: string;
  closeTime: string;
  maxPeoplePerSlot: number;
  maxAdvanceDays: number;
  slotDurationMinutes: number;
  bookingPricePerSession: number;
  lineUrl: string;
  contactPhone: string;
  contactEmail: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankName: string;
  promptpayNumber: string;
};

const Section = ({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
      <div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
    <div className="p-6 space-y-5">{children}</div>
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="font-medium">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const ToggleRow = ({ label, description, checked, onCheckedChange, testId }: { label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void; testId?: string }) => (
  <div className="flex items-center justify-between py-2 rounded-lg">
    <div>
      <p className="font-medium text-sm text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} data-testid={testId} />
  </div>
);

export function AdminSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "บันทึกการตั้งค่าสำเร็จ", description: "การเปลี่ยนแปลงมีผลแล้ว" });
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
    },
  });

  const [form, setForm] = useState<SettingsForm>({
    bookingEnabled: true, bookingAutoConfirm: false, maintenanceMode: false, maintenanceMessage: "",
    openTime: "06:00", closeTime: "20:00", maxPeoplePerSlot: 20,
    maxAdvanceDays: 30, slotDurationMinutes: 60, bookingPricePerSession: 0,
    lineUrl: "", contactPhone: "", contactEmail: "",
    bankAccountName: "", bankAccountNumber: "", bankName: "", promptpayNumber: "",
  });

  useEffect(() => {
    if (data) {
      const d = data as any;
      setForm({
        bookingEnabled: d.bookingEnabled ?? true,
        bookingAutoConfirm: d.bookingAutoConfirm ?? false,
        maintenanceMode: d.maintenanceMode ?? false,
        maintenanceMessage: d.maintenanceMessage ?? "",
        openTime: d.openTime ?? "06:00",
        closeTime: d.closeTime ?? "20:00",
        maxPeoplePerSlot: d.maxPeoplePerSlot ?? 20,
        maxAdvanceDays: d.maxAdvanceDays ?? 30,
        slotDurationMinutes: d.slotDurationMinutes ?? 60,
        bookingPricePerSession: Number(d.bookingPricePerSession ?? 0),
        lineUrl: d.lineUrl ?? "",
        contactPhone: d.contactPhone ?? "",
        contactEmail: d.contactEmail ?? "",
        bankAccountName: d.bankAccountName ?? "",
        bankAccountNumber: d.bankAccountNumber ?? "",
        bankName: d.bankName ?? "",
        promptpayNumber: d.promptpayNumber ?? "",
      });
    }
  }, [data]);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const handleSave = () => updateMutation.mutate({ data: form as any });

  if (isLoading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title="การตั้งค่าระบบ"
        subtitle="ปรับแต่งการทำงานของสระว่ายน้ำและระบบจอง"
        icon={Settings}
        gradient="from-sky-400 to-indigo-600"
        actions={
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="save-settings">
            <Save className="w-4 h-4" />{updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        }
      />

      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        form.maintenanceMode ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"
        : form.bookingEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300"
        : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"}`}>
        {form.maintenanceMode ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
        <p className="text-sm font-medium">
          {form.maintenanceMode ? "ระบบอยู่ในโหมดปิดปรับปรุง — สมาชิกไม่สามารถจองได้" : form.bookingEnabled ? "ระบบเปิดรับการจองปกติ" : "การจองถูกปิดชั่วคราว"}
        </p>
      </div>

      {/* Booking Control */}
      <Section icon={<Settings className="w-4 h-4" />} title="ควบคุมการจอง" description="เปิด/ปิดระบบการจองและโหมดปิดปรับปรุง">
        <ToggleRow label="เปิดรับการจอง" description="อนุญาตให้สมาชิกจองช่วงเวลาใช้สระ" checked={form.bookingEnabled} onCheckedChange={v => set("bookingEnabled", v)} testId="toggle-booking" />
        <div className="h-px bg-border" />
        <ToggleRow label="ยืนยันการจองอัตโนมัติ" description="เปิด = จองแล้วยืนยันและหักสิทธิ์ทันที / ปิด = ต้องให้แอดมินกดยืนยันก่อนถึงหักสิทธิ์" checked={form.bookingAutoConfirm} onCheckedChange={v => set("bookingAutoConfirm", v)} testId="toggle-autoconfirm" />
        <div className="h-px bg-border" />
        <ToggleRow label="โหมดปิดปรับปรุง" description="ปิดระบบชั่วคราวเพื่อบำรุงรักษา" checked={form.maintenanceMode} onCheckedChange={v => set("maintenanceMode", v)} testId="toggle-maintenance" />
        {form.maintenanceMode && (
          <Field label="ข้อความแจ้งเตือน" hint="ข้อความนี้จะแสดงให้สมาชิกเห็นขณะปิดปรับปรุง">
            <Textarea value={form.maintenanceMessage} onChange={e => set("maintenanceMessage", e.target.value)} placeholder="เช่น สระปิดปรับปรุงวันที่ 20-22 มิ.ย." rows={3} data-testid="maintenance-message" />
          </Field>
        )}
      </Section>

      {/* Operating Hours */}
      <Section icon={<Clock className="w-4 h-4" />} title="เวลาทำการ" description="กำหนดเวลาเปิด-ปิดของสระว่ายน้ำ">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="เวลาเปิด" hint="เวลาเริ่มรับการจอง">
            <Input type="time" value={form.openTime} onChange={e => set("openTime", e.target.value)} data-testid="open-time" />
          </Field>
          <Field label="เวลาปิด" hint="เวลาสิ้นสุดการจอง">
            <Input type="time" value={form.closeTime} onChange={e => set("closeTime", e.target.value)} data-testid="close-time" />
          </Field>
        </div>
        <Field label="ความยาวแต่ละช่วงเวลา (นาที)" hint="เช่น 60 = ช่วงละ 1 ชั่วโมง">
          <div className="flex items-center gap-3">
            <Input type="number" min={15} max={240} step={15} value={form.slotDurationMinutes} onChange={e => set("slotDurationMinutes", parseInt(e.target.value) || 60)} className="max-w-[140px]" data-testid="slot-duration" />
            <span className="text-sm text-muted-foreground">นาที</span>
          </div>
        </Field>
      </Section>

      {/* Capacity */}
      <Section icon={<Users className="w-4 h-4" />} title="ความจุและข้อจำกัด" description="กำหนดจำนวนคนสูงสุดและการจองล่วงหน้า">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="คนสูงสุดต่อช่วงเวลา" hint="จำนวนคนสูงสุดในแต่ละ session">
            <div className="flex items-center gap-3">
              <Input type="number" min={1} max={200} value={form.maxPeoplePerSlot} onChange={e => set("maxPeoplePerSlot", parseInt(e.target.value) || 20)} className="max-w-[140px]" data-testid="max-people" />
              <span className="text-sm text-muted-foreground">คน</span>
            </div>
          </Field>
          <Field label="จองล่วงหน้าสูงสุด" hint="สมาชิกจองได้ไม่เกินกี่วัน">
            <div className="flex items-center gap-3">
              <Input type="number" min={1} max={365} value={form.maxAdvanceDays} onChange={e => set("maxAdvanceDays", parseInt(e.target.value) || 30)} className="max-w-[140px]" data-testid="max-advance" />
              <span className="text-sm text-muted-foreground">วัน</span>
            </div>
          </Field>
        </div>
      </Section>

      {/* Payment */}
      <Section icon={<CreditCard className="w-4 h-4" />} title="ค่าบริการและการชำระเงิน" description="กำหนดราคาจองและข้อมูลบัญชี">
        <Field label="ราคาจอง / ครั้ง (บาท)" hint="0 = ฟรี, ระบบจะตัดจากกระเป๋าเงินอัตโนมัติ">
          <div className="flex items-center gap-3">
            <Input type="number" min={0} value={form.bookingPricePerSession} onChange={e => set("bookingPricePerSession", parseFloat(e.target.value) || 0)} className="max-w-[140px]" />
            <span className="text-sm text-muted-foreground">บาท</span>
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ชื่อธนาคาร">
            <Input value={form.bankName} onChange={e => set("bankName", e.target.value)} placeholder="ธนาคารกสิกรไทย" />
          </Field>
          <Field label="เลขบัญชี">
            <Input value={form.bankAccountNumber} onChange={e => set("bankAccountNumber", e.target.value)} placeholder="xxx-x-xxxxx-x" />
          </Field>
        </div>
        <Field label="ชื่อบัญชี">
          <Input value={form.bankAccountName} onChange={e => set("bankAccountName", e.target.value)} placeholder="บริษัท อะควาริช จำกัด" />
        </Field>
        <Field label="เบอร์ PromptPay" hint="เบอร์โทรหรือเลขบัตรประชาชนสำหรับ PromptPay">
          <Input value={form.promptpayNumber} onChange={e => set("promptpayNumber", e.target.value)} placeholder="0XX-XXX-XXXX" />
        </Field>
      </Section>

      {/* Contact / LINE */}
      <Section icon={<MessageSquare className="w-4 h-4" />} title="ข้อมูลติดต่อและ LINE" description="ตั้งค่าปุ่ม LINE และข้อมูลติดต่อ">
        <Field label="LINE Official URL" hint="ลิงก์ไปยัง LINE Official Account — ปุ่ม LINE จะแสดงเมื่อมี URL">
          <Input value={form.lineUrl} onChange={e => set("lineUrl", e.target.value)} placeholder="https://line.me/R/ti/p/@xxx" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="เบอร์โทรติดต่อ">
            <Input value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="02-xxx-xxxx" />
          </Field>
          <Field label="อีเมลติดต่อ">
            <Input type="email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="contact@aquarich.com" />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end pt-2">
        <Button size="lg" onClick={handleSave} disabled={updateMutation.isPending} className="gap-2 px-8" data-testid="save-settings-bottom">
          <Save className="w-4 h-4" />{updateMutation.isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </Button>
      </div>
    </div>
  );
}
