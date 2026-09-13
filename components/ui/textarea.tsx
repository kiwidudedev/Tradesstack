import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn("flex min-h-24 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 font-body text-sm leading-6 text-[var(--text-primary)] transition-colors placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />,
);
Textarea.displayName = "Textarea";

