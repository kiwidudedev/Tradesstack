import * as React from "react";
import { cn } from "@/lib/utils";

interface OperationalEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function OperationalEmptyState({
  title,
  description,
  icon,
  actions,
  className,
  children,
  ...props
}: OperationalEmptyStateProps) {
  return (
    <div
      className={cn("rounded-[var(--radius-lg)] border border-dashed border-[var(--app-border)] bg-[var(--surface-subtle)] px-6 py-8 text-center", className)}
      {...props}
    >
      {icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--text-muted)]">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-[var(--text-primary)]">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
      {children}
      {actions ? <div className="mt-5 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
