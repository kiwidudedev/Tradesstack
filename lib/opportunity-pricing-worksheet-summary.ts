import {
  createDefaultWorksheetPricingSummary,
  type WorksheetCell,
  type WorksheetData,
  type WorksheetPricingSummary,
} from "@/lib/opportunity-pricing-worksheet-defaults";

function roundPricingSummaryValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function getCellNumericValue(cell: WorksheetCell | undefined) {
  const candidate = typeof cell?.computedValue === "number"
    ? cell.computedValue
    : typeof cell?.value === "number"
      ? cell.value
      : null;

  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function getCellTextValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  if (typeof cell.value === "string" && cell.value.trim()) {
    return cell.value.trim();
  }

  if (typeof cell.displayValue === "string" && cell.displayValue.trim()) {
    return cell.displayValue.trim();
  }

  if (typeof cell.computedValue === "string" && cell.computedValue.trim()) {
    return cell.computedValue.trim();
  }

  return null;
}

function normalizeLabel(label: string | null) {
  return label?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

type SummaryCandidate = {
  label: string;
  value: number;
};

function pickBestCandidate(candidates: SummaryCandidate[], matcher?: (candidate: SummaryCandidate) => boolean) {
  const filtered = matcher ? candidates.filter(matcher) : candidates;
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

export function deriveWorksheetPricingSummary(
  worksheet: WorksheetData,
  baseSummary?: Partial<WorksheetPricingSummary> | null,
  options?: {
    calculatedAt?: string | null;
  },
): WorksheetPricingSummary {
  const currentSummary = {
    ...createDefaultWorksheetPricingSummary(),
    ...(baseSummary ?? {}),
  };
  const subtotalCandidates: SummaryCandidate[] = [];
  const marginCandidates: SummaryCandidate[] = [];
  const gstCandidates: SummaryCandidate[] = [];
  const totalCandidates: SummaryCandidate[] = [];

  for (const row of worksheet.rows) {
    let label: string | null = null;
    let value: number | null = null;

    for (const column of worksheet.columns) {
      const cell = worksheet.cells[`${column.id}${row.id}`];
      if (!label) {
        label = getCellTextValue(cell);
      }

      const numericValue = getCellNumericValue(cell);
      if (numericValue !== null) {
        value = numericValue;
      }
    }

    if (!label || value === null) {
      continue;
    }

    const normalized = normalizeLabel(label);
    const candidate = { label: normalized, value } satisfies SummaryCandidate;

    if (/\bsubtotal\b/.test(normalized) && !/\bgst\b/.test(normalized)) {
      subtotalCandidates.push(candidate);
    }

    if (/\bmargin\b|\bmark ?up\b/.test(normalized)) {
      marginCandidates.push(candidate);
    }

    if (/\bgst\b|\btax\b/.test(normalized)) {
      gstCandidates.push(candidate);
    }

    if (/\btotal\b|\bsell price\b|\bsell total\b/.test(normalized) && !/\bsubtotal\b/.test(normalized)) {
      totalCandidates.push(candidate);
    }
  }

  const subtotal = pickBestCandidate(subtotalCandidates);
  const margin = pickBestCandidate(marginCandidates);
  const gst = pickBestCandidate(gstCandidates);
  const grandTotal =
    pickBestCandidate(totalCandidates, (candidate) =>
      /\bgrand total\b|\btotal incl\b|\btotal including\b|\bsell price\b|\bsell total\b/.test(candidate.label),
    ) ?? pickBestCandidate(totalCandidates);

  const hasDerivedValue = Boolean(subtotal || margin || gst || grandTotal);

  return {
    version: typeof currentSummary.version === "number" ? currentSummary.version : 1,
    currency:
      typeof currentSummary.currency === "string" && currentSummary.currency.trim()
        ? currentSummary.currency
        : "NZD",
    subtotal: subtotal ? roundPricingSummaryValue(subtotal.value) : roundPricingSummaryValue(currentSummary.subtotal ?? null),
    margin: margin ? roundPricingSummaryValue(margin.value) : roundPricingSummaryValue(currentSummary.margin ?? null),
    gst: gst ? roundPricingSummaryValue(gst.value) : roundPricingSummaryValue(currentSummary.gst ?? null),
    grandTotal: grandTotal
      ? roundPricingSummaryValue(grandTotal.value)
      : roundPricingSummaryValue(currentSummary.grandTotal ?? null),
    lastCalculatedAt: hasDerivedValue
      ? options?.calculatedAt ?? currentSummary.lastCalculatedAt ?? new Date().toISOString()
      : currentSummary.lastCalculatedAt ?? null,
  };
}
