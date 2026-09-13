import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className="relative block">
      <select ref={ref} className={cn("h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 pr-9 font-body text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>{children}</select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
    </span>
  ),
);
Select.displayName = "Select";

