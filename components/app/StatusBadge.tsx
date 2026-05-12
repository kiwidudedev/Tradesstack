import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      status: {
        draft: "bg-[var(--status-draft-light)] text-[var(--status-draft)]",
        pending: "bg-[var(--status-pending-light)] text-[var(--status-pending)]",
        sent: "bg-[var(--status-sent-light)] text-[var(--status-sent)]",
        approved: "bg-[var(--status-approved-light)] text-[var(--status-approved)]",
        overdue: "bg-[var(--status-overdue-light)] text-[var(--status-overdue)]",
        completed: "bg-[var(--status-completed-light)] text-[var(--status-completed)]",
        active: "bg-[var(--status-active-light)] text-[var(--status-active)]",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {}

export function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ status }), className)} {...props} />;
}

export { statusBadgeVariants };
