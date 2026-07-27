import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

export function resolveWorksheetPersistenceName(params: {
  worksheet: Pick<WorksheetData, "sheetName">;
  worksheetName?: string | null;
  fallback?: string;
}) {
  const liveSheetName = params.worksheet.sheetName?.trim();
  if (liveSheetName) {
    return liveSheetName;
  }

  const stateSheetName = params.worksheetName?.trim();
  if (stateSheetName) {
    return stateSheetName;
  }

  return params.fallback ?? "Pricing Worksheet";
}
