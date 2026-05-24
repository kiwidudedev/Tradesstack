import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";

export type WorksheetSaveValidationResult =
  | { ok: true; worksheet: WorksheetData }
  | { ok: false; message: string };

export function validateWorksheetBeforeSave(worksheet: WorksheetData): WorksheetSaveValidationResult {
  const mutationResult = applyWorksheetMutation(worksheet, (current) => current, {
    validateFormulaOutputs: true,
  });

  if (!mutationResult.validation.ok) {
    return {
      ok: false,
      message: mutationResult.validation.message.replace("Mutation blocked", "Save blocked"),
    };
  }

  return {
    ok: true,
    worksheet: mutationResult.nextWorksheet,
  };
}
