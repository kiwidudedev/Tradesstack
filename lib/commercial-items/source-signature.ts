import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import { buildCommercialItemLockedMetadata, buildWorksheetSelectionRangeLabel } from "@/lib/commercial-items/snapshot";
import type { Json } from "@/lib/supabase/types";

function stableSerializeJson(value: Json | Record<string, Json | undefined> | undefined): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerializeJson(nestedValue)}`)
    .join(",")}}`;
}

function hashString(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildCommercialItemSourceSignature(params: {
  workbookId: string;
  sheetId: string;
  worksheet: WorksheetData;
  range: WorksheetSelectionRange;
  fingerprint?: Json;
}) {
  const { workbookId, sheetId, worksheet, range } = params;
  const lockedMetadata = buildCommercialItemLockedMetadata({
    worksheet,
    range,
    sheetName: worksheet.sheetName,
  });

  const serialized = stableSerializeJson({
    workbookId,
    sheetId,
    worksheetVersion: worksheet.version,
    range: buildWorksheetSelectionRangeLabel(worksheet, range),
    fingerprint: params.fingerprint,
    cells: lockedMetadata.cells.map((cell) => ({
      cellKey: cell.cellKey,
      formula: cell.formula,
      value: cell.value,
      computedValue: cell.computedValue,
      displayValue: cell.displayValue,
      metadata: cell.metadata,
    })) as unknown as Json,
  });

  return `ciws_v1_${hashString(serialized)}`;
}
