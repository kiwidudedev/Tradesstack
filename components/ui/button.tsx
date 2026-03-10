import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "orange" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-[#1d1d1d] text-white hover:bg-[#111111]",
  orange: "bg-accent text-white hover:bg-accent/90",
  outline:
    "border border-border bg-surface text-text hover:border-accent/45 hover:bg-accent-soft/30 hover:text-accent",
  ghost: "border border-transparent bg-transparent text-text-muted hover:bg-surface-muted hover:text-text",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-10 px-5 text-sm",
  sm: "h-9 px-4 text-xs",
  lg: "h-11 px-6 text-base",
  icon: "h-10 w-10 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", asChild, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(
          "ui-button inline-flex items-center justify-center rounded-full font-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:pointer-events-none disabled:opacity-50",
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
