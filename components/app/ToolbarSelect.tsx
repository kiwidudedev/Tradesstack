import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canonical operational toolbar select.
 * Matches the toolbar rhythm: 40px height, 14px text, 12px radius.
 * Renders a native <select> with appearance-none + a built-in chevron and
 * optional leading icon, so consumers don't have to recreate the positioning
 * + chevron + appearance-none scaffolding every time.
 */
export interface ToolbarSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  leadingIcon?: React.ReactNode;
  wrapperClassName?: string;
}

export const ToolbarSelect = React.forwardRef<HTMLSelectElement, ToolbarSelectProps>(
  ({ leadingIcon, wrapperClassName, className, children, ...props }, ref) => {
    return (
      <div className={cn("relative", wrapperClassName)}>
        {leadingIcon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] [&>svg]:h-4 [&>svg]:w-4">
            {leadingIcon}
          </span>
        ) : null}
        <select
          ref={ref}
          className={cn(
            "h-10 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] pr-10 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
            leadingIcon ? "pl-10" : "pl-3.5",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          strokeWidth={2}
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
        />
      </div>
    );
  },
);

ToolbarSelect.displayName = "ToolbarSelect";
