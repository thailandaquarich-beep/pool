import { FC, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ThemeColor } from "@/lib/theme-colors";

/**
 * HSV-style color wheel: angle = hue, distance-from-center = saturation. Drag anywhere
 * (mouse or touch) to pick; a slider underneath controls lightness.
 */
export const ColorWheel: FC<{ value: ThemeColor; onChange: (c: ThemeColor) => void; size?: number; className?: string }> = ({
  value, onChange, size = 240, className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const R = r.width / 2;
    const s = Math.min(Math.sqrt(dx * dx + dy * dy) / R, 1) * 100;
    let h = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 at top, clockwise — matches conic-gradient
    h = (h + 360) % 360;
    onChange({ ...value, h: Math.round(h), s: Math.round(s) });
  };

  const rad = (value.h * Math.PI) / 180;
  const knobLeft = 50 + 50 * (value.s / 100) * Math.sin(rad);
  const knobTop = 50 + 50 * (value.s / 100) * -Math.cos(rad);

  return (
    <div className={cn("space-y-4", className)}>
      <div
        ref={ref}
        onPointerDown={(e) => { dragging.current = true; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); fromPointer(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging.current) fromPointer(e.clientX, e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        className="relative mx-auto rounded-full cursor-crosshair touch-none select-none ring-1 ring-border shadow-inner"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle, hsl(0 0% 100%) 0%, hsl(0 0% 100% / 0) 70%), conic-gradient(hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
        }}
      >
        <div
          className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-[3px] border-white shadow-lg pointer-events-none ring-1 ring-black/20"
          style={{ left: `${knobLeft}%`, top: `${knobTop}%`, background: `hsl(${value.h} ${value.s}% ${value.l}%)` }}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>ความสว่าง</span>
          <span>{value.l}%</span>
        </div>
        <input
          type="range" min={20} max={90} value={value.l}
          onChange={(e) => onChange({ ...value, l: Number(e.target.value) })}
          className="w-full h-3 rounded-full appearance-none cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/20"
          style={{ background: `linear-gradient(to right, hsl(${value.h} ${value.s}% 22%), hsl(${value.h} ${value.s}% 55%), hsl(${value.h} ${value.s}% 88%))` }}
        />
      </div>
    </div>
  );
};
