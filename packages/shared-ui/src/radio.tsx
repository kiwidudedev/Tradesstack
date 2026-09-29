import * as React from "react";
import { cn } from "./utils";

export const Radio = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} type="radio" className={cn("h-4 w-4 border-[var(--border)] accent-[var(--brand-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2", className)} {...props} />,
);
Radio.displayName = "Radio";
