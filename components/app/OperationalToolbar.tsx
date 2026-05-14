import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical toolbar control rhythm:
 *   height  = 40px (h-10)
 *   text    = 14px (text-sm)
 *   radius  = 12px (var(--radius-md))
 *   gap     = 12px (gap-3, owned by this primitive)
 *
 * Use Button size="toolbar" for action buttons so they align flush with the
 * search input and filter selects passed into the search/filters slots.
 */
interface OperationalToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}

export function OperationalToolbar({
  leading,
  search,
  filters,
  actions,
  className,
  children,
  ...props
}: OperationalToolbarProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)} {...props}>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {leading}
        {search ? <div className="min-w-0 flex-1 sm:max-w-sm">{search}</div> : null}
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
