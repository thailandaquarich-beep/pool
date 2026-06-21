import { FC, useRef, useState } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable image picker — uploads a local file (converted to a base64 data URL).
 * No external links: every image in the app is uploaded, stored, and served inline.
 */
export const ImageUpload: FC<{
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  /** max file size in MB (default 4) */
  maxMb?: number;
  /** preview shape */
  shape?: "square" | "circle" | "wide";
  className?: string;
  label?: string;
}> = ({ value, onChange, maxMb = 4, shape = "square", className, label = "อัปโหลดรูปภาพ" }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("ไฟล์ต้องเป็นรูปภาพเท่านั้น"); return; }
    if (file.size > maxMb * 1024 * 1024) { setErr(`รูปใหญ่เกินไป (สูงสุด ${maxMb}MB)`); return; }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = (ev) => { onChange((ev.target?.result as string) || null); setBusy(false); };
    reader.onerror = () => { setErr("อ่านไฟล์ไม่สำเร็จ"); setBusy(false); };
    reader.readAsDataURL(file);
  };

  const box = shape === "circle" ? "w-24 h-24 rounded-full" : shape === "wide" ? "w-full h-40 rounded-xl" : "w-28 h-28 rounded-xl";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={cn(
            "relative overflow-hidden border-2 border-dashed border-border bg-muted/40 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors shrink-0",
            box,
          )}
        >
          {value ? (
            <img src={value} alt="preview" className="w-full h-full object-cover" />
          ) : busy ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <div className="flex flex-col items-center gap-1 px-2 text-center">
              <ImagePlus className="w-6 h-6" />
              <span className="text-[10px] leading-tight">{label}</span>
            </div>
          )}
        </button>

        <div className="space-y-1.5">
          <button type="button" onClick={() => ref.current?.click()} disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
            {value ? "เปลี่ยนรูป" : "เลือกรูป"}
          </button>
          {value && (
            <button type="button" onClick={() => { onChange(null); setErr(null); }}
              className="ml-2 text-xs text-destructive inline-flex items-center gap-1 hover:underline">
              <X className="w-3 h-3" /> ลบรูป
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">รองรับ JPG/PNG/WebP · สูงสุด {maxMb}MB</p>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
};
