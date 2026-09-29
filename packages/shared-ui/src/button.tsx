import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "./utils";

type ButtonVariant = "default" | "orange" | "outline" | "ghost" | "primary" | "secondary" | "destructive";
type ButtonSize = "default" | "sm" | "md" | "lg" | "icon" | "toolbar";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary)]",
  orange: "bg-[var(--orange-primary)] text-white hover:bg-[var(--orange-hover)] focus-visible:ring-[var(--orange-primary)]",
  primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary)]",
  outline: "border border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-muted)] focus-visible:ring-[var(--border)]",
  secondary: "border border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-muted)] focus-visible:ring-[var(--border)]",
  ghost: "bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-muted)] focus-visible:ring-[var(--border)]",
  destructive: "bg-[var(--error)] text-white hover:bg-[#B91C1C] focus-visible:ring-[var(--error)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-11 px-4 text-base rounded-[var(--radius-md)]",
  sm: "h-9 px-3 text-sm rounded-[var(--radius-sm)]",
  md: "h-11 px-4 text-base rounded-[var(--radius-md)]",
  lg: "h-12 px-6 text-base rounded-[var(--radius-md)]",
  icon: "h-10 w-10 p-0",
  toolbar: "h-10 px-3.5 text-sm rounded-[var(--radius-md)]",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", asChild, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(
          "ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap font-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
