import * as React from "react";
import { cn } from "@/lib/utils";

type InputSize = "default" | "toolbar";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
}

const sizeStyles: Record<InputSize, string> = {
  default: "h-11",
  toolbar: "h-10",
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 font-body text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
