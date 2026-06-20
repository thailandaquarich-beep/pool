import { FC, useEffect, useRef } from "react";

/**
 * Global decorative backdrop for the authenticated app shell:
 *  - animated aurora mesh + faint grid + floating brand blobs
 *  - a soft glow that trails the cursor (--mx/--my)
 *  - an expanding ripple burst on every click (rendered in a top overlay)
 * Purely visual: pointer-events-none, aria-hidden, and disabled under
 * prefers-reduced-motion (the static mesh stays for cohesion).
 */
export const AmbientBackground: FC = () => {
  const bgRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bg = bgRef.current;
    const fx = fxRef.current;
    if (!bg || !fx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bg.style.setProperty("--mx", `${x}px`);
        bg.style.setProperty("--my", `${y}px`);
      });
    };

    const onDown = (e: PointerEvent) => {
      const r = document.createElement("span");
      r.className = "ambient__ripple";
      r.style.setProperty("--rx", `${e.clientX}px`);
      r.style.setProperty("--ry", `${e.clientY}px`);
      fx.appendChild(r);
      r.addEventListener("animationend", () => r.remove(), { once: true });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={bgRef} className="ambient" aria-hidden="true">
        <div className="ambient__mesh" />
        <div className="ambient__grid" />
        <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand-from/15 blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-brand-to/12 blur-3xl animate-float-slow" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 rounded-full bg-brand-via/12 blur-3xl animate-float" />
        <div className="ambient__cursor" />
      </div>
      <div ref={fxRef} className="ambient-fx" aria-hidden="true" />
    </>
  );
};
