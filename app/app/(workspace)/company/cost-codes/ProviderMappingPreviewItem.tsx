import type { AccountingResolutionPreviewRow } from "@/lib/accounting/types";

const DOCUMENT_KIND_LABELS: Record<string, string> = {
  opportunity_quote: "Opportunity Quote",
  project_quote: "Project Quote",
  project_variation: "Variation",
  project_purchase_order: "Purchase Order",
  project_claim: "Payment Claim",
  supplier_invoice: "Supplier Invoice",
  retention: "Retention",
  timesheet: "Timesheet",
};

function formatDocumentKind(documentKind: string): string {
  return (
    DOCUMENT_KIND_LABELS[documentKind] ??
    documentKind
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ")
  );
}

export function getProviderMappingPreviewSecondaryText(
  row: Pick<
    AccountingResolutionPreviewRow,
    "description" | "sourceDocumentKind" | "sourceDocumentNumber"
  >
): string {
  const documentKind = row.sourceDocumentKind?.trim();
  if (documentKind) {
    const documentLabel = formatDocumentKind(documentKind);
    const documentNumber = row.sourceDocumentNumber?.trim();
    return `Source: ${documentLabel}${documentNumber ? ` ${documentNumber}` : ""}`;
  }

  return row.description?.trim() || "No description";
}

export function ProviderMappingPreviewItem({
  row,
}: {
  row: Pick<
    AccountingResolutionPreviewRow,
    "title" | "description" | "sourceDocumentKind" | "sourceDocumentNumber"
  >;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-[var(--text-primary)]">{row.title ?? "Untitled item"}</p>
      <p className="break-words text-xs text-[var(--text-secondary)]">
        {getProviderMappingPreviewSecondaryText(row)}
      </p>
    </div>
  );
}
