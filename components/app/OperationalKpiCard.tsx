import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OperationalKpiTrend = "up" | "down" | "neutral";

/**
 * Brand-aligned KPI tones. Each tone pairs a soft background with a foreground
 * icon colour drawn from the TradesStack palette (orange + navy with sage,
 * amber, red as semantic accents).
 *
 * - `orange`  — attention / new items (brand orange family)
 * - `navy`    — informational / in-progress (brand navy family)
 * - `sage`    — positive / active / completed
 * - `amber`   — warm / finance / value (amber bg + brand orange icon)
 * - `red`     — issue / overdue / blocker
 * - `neutral` — fallback grey, no semantic meaning
 */
export type OperationalKpiTone = "neutral" | "orange" | "navy" | "sage" | "amber" | "red";

interface OperationalKpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: OperationalKpiTrend;
  tone?: OperationalKpiTone;
}

const trendClassName: Record<OperationalKpiTrend, string> = {
  up: "text-[var(--kpi-fg-sage)]",
  down: "text-[var(--kpi-fg-red)]",
  neutral: "text-[var(--text-secondary)]",
};

/**
 * Canonical KPI icon-container tone classes. Use these on any bespoke metric
 * surface that does not yet consume <OperationalKpiCard> so every KPI icon
 * across the app shares the same brand-aligned soft-tint system.
 */
export const operationalKpiToneClassName: Record<OperationalKpiTone, string> = {
  neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  orange: "bg-[var(--kpi-bg-peach)] text-[var(--kpi-fg-orange)]",
  navy: "bg-[var(--kpi-bg-navy)] text-[var(--kpi-fg-navy)]",
  sage: "bg-[var(--kpi-bg-sage)] text-[var(--kpi-fg-sage)]",
  amber: "bg-[var(--kpi-bg-amber)] text-[var(--kpi-fg-orange)]",
  red: "bg-[var(--kpi-bg-red)] text-[var(--kpi-fg-red)]",
};

export function OperationalKpiCard({
  label,
  value,
  helper,
  icon,
  trend = "neutral",
  tone = "neutral",
  className,
  children,
  ...props
}: OperationalKpiCardProps) {
  return (
    <Card
      className={cn("flex flex-col p-5", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 truncate text-sm font-medium text-[var(--text-secondary)]">{label}</p>
          <p className="min-w-0 break-words text-[var(--font-size-kpi)] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">{value}</p>
        </div>
        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]", operationalKpiToneClassName[tone])}>
            {icon}
          </div>
        ) : null}
      </div>
      {helper ? <p className={cn("mt-3 text-sm font-medium", trendClassName[trend])}>{helper}</p> : null}
      {children}
    </Card>
  );
}
