import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-3 py-1 text-xs font-semibold tracking-tight",
  {
    variants: {
      variant: {
        default: "bg-[var(--brand-orange)] text-white",
        secondary: "bg-slate-100 text-[var(--brand-blue)]",
        outline: "border border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))]"
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
