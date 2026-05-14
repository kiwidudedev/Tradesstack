import * as React from "react";
import { ibmPlexSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

export type FormLabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function FormLabel({ className, children, ...props }: FormLabelProps) {
  return (
    <label
      className={cn(
        ibmPlexSans.className,
        "mb-1 block text-[13px] font-semibold text-[var(--text-primary)]",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}
