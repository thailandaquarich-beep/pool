import { FC, ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** tailwind `from-* to-*` stops for the icon tile; defaults to brand ocean */
  gradient?: string;
  /** right-aligned content (buttons, counts, …) */
  actions?: ReactNode;
  className?: string;
}

/** Consistent page heading: dimensional icon tile + gradient title + actions. */
export const PageHeader: FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  gradient = "from-brand-from to-brand-to",
  actions,
  className,
}) => {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className={cn("icon-tile rounded-2xl p-2.5 bg-gradient-to-br shrink-0", gradient)}>
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-gradient truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};
