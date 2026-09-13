"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { interMedium } from "@/lib/fonts";

export function PricingWorksheetEntryPanel({
  title = "Pricing Worksheet",
  description,
  actionLabel,
  secondaryText,
  badge,
  disabled = false,
  onOpenWorksheet,
}: {
  title?: string;
  description: string;
  actionLabel: string;
  secondaryText: string;
  badge?: string | null;
  disabled?: boolean;
  onOpenWorksheet: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-none sm:p-8">
      <div className="max-w-2xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-[var(--surface-muted)] text-[var(--text-primary)]">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
          {badge ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
              {badge}
            </span>
          ) : null}
        </div>
        <p className={`${interMedium.className} mt-3 text-sm leading-6 text-[var(--text-secondary)]`}>
          {description}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onOpenWorksheet} disabled={disabled} className="h-10 rounded-full px-5">
            {actionLabel}
          </Button>
          <p className={`${interMedium.className} text-sm text-[var(--text-secondary)]`}>{secondaryText}</p>
        </div>
      </div>
    </div>
  );
}

