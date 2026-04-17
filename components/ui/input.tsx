import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-[6px] border border-border bg-surface px-3.5 font-body text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-0 focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
