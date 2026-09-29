import * as React from "react";
import { cn } from "./utils";

export function Switch({ checked, onCheckedChange, className, disabled, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)} className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:opacity-50", checked ? "bg-[var(--brand-blue)]" : "bg-[var(--switch-background)]", className)} {...props}><span className={cn("pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} /></button>;
}
