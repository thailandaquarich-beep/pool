import { FC } from "react";
import { cn } from "@/lib/utils";

type BrandSize = "sm" | "md" | "lg";

interface BrandMarkProps {
  /** sm: header · md: sidebar/auth · lg: hero / 404 */
  size?: BrandSize;
  /** show the "Aquarich" wordmark next to the logo */
  showText?: boolean;
  /** show the "Reservation System" subline (implies showText) */
  tagline?: boolean;
  className?: string;
}

const tile: Record<BrandSize, string> = {
  sm: "p-1 rounded-lg",
  md: "p-1.5 rounded-xl",
  lg: "p-2 rounded-2xl",
};
const img: Record<BrandSize, string> = {
  sm: "w-7 h-7",
  md: "w-8 h-8",
  lg: "w-14 h-14",
};
const word: Record<BrandSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-3xl",
};

/** Consistent Aquarich logo + wordmark used across the app. */
export const BrandMark: FC<BrandMarkProps> = ({
  size = "md",
  showText = true,
  tagline = false,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("bg-brand glow-sm flex-shrink-0", tile[size])}>
        <img
          src="/aquarich-logo.png"
          alt="Aquarich"
          className={cn("object-contain", img[size])}
        />
      </div>
      {showText && (
        <div className="leading-tight">
          <span className={cn("font-display font-extrabold text-gradient block", word[size])}>
            Aquarich
          </span>
          {tagline && (
            <span className="text-xs text-muted-foreground">Reservation System</span>
          )}
        </div>
      )}
    </div>
  );
};
