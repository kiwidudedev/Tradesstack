import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";

export type WorksheetSaveValidationResult =
  | { ok: true; worksheet: WorksheetData }
  | { ok: false; message: string };

export function validateWorksheetBeforeSave(worksheet: WorksheetData): WorksheetSaveValidationResult {
  const mutationResult = applyWorksheetMutation(worksheet, (current) => current, {
    // Spreadsheet errors are valid calculated cell states. They must be
    // persisted with the formula so that the sheet can recover when its
    // inputs change; persistence failures are reported by the save request.
    validateFormulaOutputs: false,
  });

  return {
    ok: true,
    worksheet: mutationResult.nextWorksheet,
  };
}
