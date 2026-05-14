import * as React from "react";
import { cn } from "@/lib/utils";

export type OperationalAlertVariant = "success" | "warning" | "error" | "info" | "neutral";

export interface OperationalAlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: OperationalAlertVariant;
}

const variantStyles: Record<OperationalAlertVariant, string> = {
  success: "border-[var(--success-light)] bg-[var(--success-light)] text-[var(--success)]",
  warning: "border-[var(--warning-light)] bg-[var(--warning-light)] text-[var(--warning)]",
  error: "border-[var(--error-light)] bg-[var(--error-light)] text-[var(--error)]",
  info: "border-[var(--info-light)] bg-[var(--info-light)] text-[var(--info)]",
  neutral: "border-[var(--neutral-light)] bg-[var(--neutral-light)] text-[var(--neutral)]",
};

export const OperationalAlert = React.forwardRef<HTMLDivElement, OperationalAlertProps>(
  ({ variant = "info", className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

OperationalAlert.displayName = "OperationalAlert";
