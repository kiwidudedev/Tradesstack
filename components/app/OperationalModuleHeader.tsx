import * as React from "react";
import { interMedium } from "@/lib/fonts";
import { cn } from "@/lib/utils";

interface OperationalModuleHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}

export function OperationalModuleHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  children,
  ...props
}: OperationalModuleHeaderProps) {
  return (
    <section
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className={`${interMedium.className} mb-1.5 text-[var(--font-size-micro)] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
            {eyebrow}
          </p>
        ) : null}
        <h1 className="m-0 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className={`${interMedium.className} mt-2 max-w-3xl text-[var(--font-size-body)] leading-6 text-[var(--text-secondary)]`}>
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">{actions}</div> : null}
    </section>
  );
}
