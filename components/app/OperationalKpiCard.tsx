import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OperationalKpiTrend = "up" | "down" | "neutral";

interface OperationalKpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: OperationalKpiTrend;
}

const trendClassName: Record<OperationalKpiTrend, string> = {
  up: "text-[var(--success)]",
  down: "text-[var(--error)]",
  neutral: "text-[var(--text-secondary)]",
};

export function OperationalKpiCard({
  label,
  value,
  helper,
  icon,
  trend = "neutral",
  className,
  children,
  ...props
}: OperationalKpiCardProps) {
  return (
    <Card
      className={cn("flex flex-col p-6", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{label}</p>
          <p className="text-3xl font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">{value}</p>
        </div>
        {icon ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
            {icon}
          </div>
        ) : null}
      </div>
      {helper ? <p className={cn("mt-4 text-sm font-medium", trendClassName[trend])}>{helper}</p> : null}
      {children}
    </Card>
  );
}
