"use client";

import Link from "next/link";
import { FileSpreadsheet, LayoutGrid } from "lucide-react";

const TAB_BASE_CLASS =
  "group -mx-[0.35rem] inline-flex items-center gap-2 border-b-2 px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors";
const TAB_ACTIVE_CLASS = "border-[var(--orange-primary)] text-[var(--brand-blue)]";
const TAB_INACTIVE_CLASS = "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

export function CommercialRecordTabs({
  detailsHref,
  pricingWorksheetHref,
  detailsLabel,
  ariaLabel,
  activeTab,
}: {
  detailsHref: string;
  pricingWorksheetHref: string;
  detailsLabel: string;
  ariaLabel: string;
  activeTab: "details" | "pricing-worksheet";
}) {
  return (
    <div className="sticky top-14 z-20 border-b border-[var(--border)] bg-[var(--background)] px-5">
      <nav aria-label={ariaLabel} className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-8">
          <Link
            href={detailsHref}
            className={`${TAB_BASE_CLASS} ${activeTab === "details" ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
          >
            <LayoutGrid strokeWidth={2.2} className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{detailsLabel}</span>
          </Link>
          <Link
            href={pricingWorksheetHref}
            className={`${TAB_BASE_CLASS} ${activeTab === "pricing-worksheet" ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
          >
            <FileSpreadsheet strokeWidth={2.2} className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Pricing Worksheet</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

