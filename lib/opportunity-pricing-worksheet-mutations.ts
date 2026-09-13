import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  findWorksheetFormulaErrors,
  recalculateWorksheetFormulas,
} from "@/lib/opportunity-pricing-worksheet-formulas";
import { startPricingWorksheetPerformanceMeasure } from "@/lib/pricing-worksheet-performance";
import { invalidateChangedWorksheetMaterialPricing } from "@/lib/worksheet-material-pricing-provenance";
import { invalidateChangedWorksheetMeasureProvenance } from "@/lib/worksheet-measure-provenance";

export type WorksheetMutationResult = {
  previousWorksheet: WorksheetData;
  nextWorksheet: WorksheetData;
  changed: boolean;
  formulaErrors: Array<{ cellKey: string; error: string }>;
  validation:
    | {
        ok: true;
      }
    | {
        ok: false;
        message: string;
      };
};

function cloneWorksheetData(worksheet: WorksheetData) {
  return JSON.parse(JSON.stringify(worksheet)) as WorksheetData;
}

function buildValidationFailureMessage(formulaErrors: Array<{ cellKey: string; error: string }>) {
  const preview = formulaErrors
    .slice(0, 4)
    .map((issue) => `${issue.cellKey} ${issue.error}`)
    .join(", ");

  return formulaErrors.length === 1
    ? `Mutation blocked because formula ${preview} is invalid. Fix the formula and try again.`
    : `Mutation blocked because ${formulaErrors.length} formulas are invalid: ${preview}. Fix the formulas and try again.`;
}

export function applyWorksheetMutation(
  currentWorksheet: WorksheetData,
  mutator: (current: WorksheetData) => WorksheetData,
  options?: {
    recalculateFormulas?: boolean;
    validateFormulaOutputs?: boolean;
  }
): WorksheetMutationResult {
  const endMutationMeasure = startPricingWorksheetPerformanceMeasure("worksheet-mutation", {
    recalculateFormulas: options?.recalculateFormulas !== false,
    validateFormulaOutputs: options?.validateFormulaOutputs === true,
    rowCount: currentWorksheet.rows.length,
    columnCount: currentWorksheet.columns.length,
    cellCount: Object.keys(currentWorksheet.cells).length,
  });
  const previousWorksheet = currentWorksheet;
  const mutatedWorksheet = mutator(cloneWorksheetData(currentWorksheet));
  const recalculatedWorksheet =
    options?.recalculateFormulas === false
      ? mutatedWorksheet
      : recalculateWorksheetFormulas(mutatedWorksheet);
  const nextWorksheet = invalidateChangedWorksheetMeasureProvenance(
    previousWorksheet,
    invalidateChangedWorksheetMaterialPricing(previousWorksheet, recalculatedWorksheet),
  );
  const changed = JSON.stringify(previousWorksheet) !== JSON.stringify(nextWorksheet);
  const formulaErrors = options?.validateFormulaOutputs
    ? findWorksheetFormulaErrors(nextWorksheet)
    : [];

  if (formulaErrors.length > 0) {
    endMutationMeasure({
      changed,
      formulaErrorCount: formulaErrors.length,
      nextCellCount: Object.keys(nextWorksheet.cells).length,
      validationOk: false,
    });
    return {
      previousWorksheet,
      nextWorksheet,
      changed,
      formulaErrors,
      validation: {
        ok: false,
        message: buildValidationFailureMessage(formulaErrors),
      },
    };
  }

  endMutationMeasure({
    changed,
    formulaErrorCount: 0,
    nextCellCount: Object.keys(nextWorksheet.cells).length,
    validationOk: true,
  });
  return {
    previousWorksheet,
    nextWorksheet,
    changed,
    formulaErrors,
    validation: {
      ok: true,
    },
  };
}
