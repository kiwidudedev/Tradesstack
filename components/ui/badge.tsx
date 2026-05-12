import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-sm)] px-3 py-1 text-xs font-semibold tracking-tight",
  {
    variants: {
      variant: {
        default: "bg-[var(--orange-primary)] text-[var(--primary-foreground)]",
        secondary: "bg-[var(--surface-muted)] text-[var(--navy-primary)]",
        outline: "border border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-primary)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
