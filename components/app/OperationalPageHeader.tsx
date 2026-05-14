import * as React from "react";
import { interBold, interMedium } from "@/lib/fonts";
import { cn } from "@/lib/utils";

interface OperationalPageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}

export function OperationalPageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  children,
  ...props
}: OperationalPageHeaderProps) {
  return (
    <section
      className={cn("flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className={`${interMedium.className} mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
            {eyebrow}
          </p>
        ) : null}
        <h1 className={`${interBold.className} m-0 text-[var(--font-size-page-title)] font-bold leading-none tracking-[-0.03em] text-[var(--text-primary)] sm:text-[var(--font-size-page-title-lg)]`}>
          {title}
        </h1>
        {description ? (
          <p className={`${interMedium.className} mt-3 max-w-3xl text-[15px] leading-6 text-[var(--text-secondary)]`}>
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </section>
  );
}
