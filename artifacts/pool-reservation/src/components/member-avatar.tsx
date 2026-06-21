import { FC } from "react";
import { cn } from "@/lib/utils";

/**
 * Round member avatar: shows the uploaded profile photo when present, otherwise
 * the initials on a brand gradient. Size via `className` (e.g. "w-10 h-10 text-sm").
 */
export const MemberAvatar: FC<{
  firstName?: string | null;
  lastName?: string | null;
  src?: string | null;
  className?: string;
}> = ({ firstName, lastName, src, className }) => {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "U";
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br from-primary to-cyan-500 text-white font-bold flex items-center justify-center shrink-0 overflow-hidden ring-2 ring-background shadow-sm",
        className,
      )}
    >
      {src ? <img src={src} alt={initials} className="w-full h-full object-cover" /> : <span>{initials}</span>}
    </div>
  );
};
