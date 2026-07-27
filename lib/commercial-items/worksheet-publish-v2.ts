import {
  buildCommercialItemLockedMetadata,
  buildCommercialItemSourceLink,
  buildCommercialItemWorksheetSnapshot,
  buildWorksheetSelectionRangeLabel,
  type CommercialItemLockedMetadataPayload,
} from "@/lib/commercial-items/snapshot";
import { buildCommercialItemSourceSignature } from "@/lib/commercial-items/source-signature";
import type {
  PublishedWorksheetSelection,
  PublishedWorksheetSkippedRow,
} from "@/lib/commercial-items/published-worksheet-selection";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import type { Json } from "@/lib/supabase/types";

export type WorksheetPublishFieldConfidence = "high" | "medium" | "low";

export interface SelectionAnchor {
  cellKey: string;
  rowId: string;
  rowIndex: number;
  rowLabel: string;
  columnId: string;
  columnIndex: number;
  columnLabel: string;
}

export interface FieldCandidate<TValue> {
  value: TValue | null;
  confidence: WorksheetPublishFieldConfidence;
  anchors: SelectionAnchor[];
}

export interface ProposedCommercialLine {
  id: string;
  rowId: string;
  rowIndex: number;
  rowLabel: string;
  sourceRange: WorksheetSelectionRange;
  sourceRangeLabel: string;
  sourceSummary: string;
  sectionHeading: string | null;
  warnings: string[];
  includeByDefault: boolean;
  description: FieldCandidate<string>;
  quantity: FieldCandidate<number>;
  unit: FieldCandidate<string>;
  rate: FieldCandidate<number>;
  total: FieldCandidate<number>;
}

export interface InterpretedWorksheetSelection {
  destination: PublishedWorksheetSelection["destination"];
  selectionRange: WorksheetSelectionRange;
  selectionRangeLabel: string;
  primaryRangeLabel: string;
  selectionRanges: WorksheetSelectionRange[];
  selectionRangeLabels: string[];
  proposedLines: ProposedCommercialLine[];
  skippedRows: PublishedWorksheetSkippedRow[];
  warnings: string[];
  visibleSelectedValues: string[];
}

export interface ConfirmedCommercialLineInput {
  proposalId: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
}

interface SelectedCellAnalysis {
  anchor: SelectionAnchor;
  cell: WorksheetCell | undefined;
  displayValue: string;
  numericValue: number | null;
}

interface SelectedRowAnalysis {
  rowIndex: number;
  rowId: string;
  rowLabel: string;
  cells: SelectedCellAnalysis[];
  textCells: SelectedCellAnalysis[];
  numericCells: SelectedCellAnalysis[];
}

interface DraftPrefill {
  description: FieldCandidate<string>;
  quantity: FieldCandidate<number>;
  unit: FieldCandidate<string>;
  rate: FieldCandidate<number>;
  total: FieldCandidate<number>;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function getCellDisplayValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return "";
  }

  if (typeof cell.displayValue === "string" && cell.displayValue.trim().length > 0) {
    return cell.displayValue.trim();
  }

  if (typeof cell.computedValue === "string" && cell.computedValue.trim().length > 0) {
    return cell.computedValue.trim();
  }

  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) {
    return String(cell.computedValue);
  }

  if (typeof cell.value === "string" && cell.value.trim().length > 0) {
    return cell.value.trim();
  }

  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return String(cell.value);
  }

  return "";
}

function getCellNumericValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  const candidates = [cell.computedValue, cell.value];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string") {
      const normalized = candidate.replaceAll(",", "").trim();
      if (!normalized) {
        continue;
      }

      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isMeaningfulText(value: string) {
  return /[a-z]/i.test(value.trim());
}

function isUnitLikeText(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.includes("$")) {
    return false;
  }

  const lowered = normalized.toLowerCase().replace(/\s+/g, "");
  const explicitUnits = [
    "ea",
    "each",
    "item",
    "items",
    "pair",
    "pairs",
    "roll",
    "rolls",
    "hr",
    "hrs",
    "hour",
    "hours",
    "day",
    "days",
    "m",
    "mm",
    "cm",
    "m2",
    "m²",
    "m3",
    "m³",
    "lm",
    "l/m",
    "kg",
    "g",
    "t",
    "tonne",
    "tonnes",
    "sheet",
    "sheets",
    "board",
    "boards",
  ];

  return explicitUnits.includes(lowered) || /^[a-z]{1,3}\d?$/i.test(normalized);
}

function inferUnitFromLabel(label: string | null) {
  if (!label) {
    return null;
  }

  const patterns = [
    /^(.+?)\s+required$/i,
    /^(.+?)\s+(qty|quantity)$/i,
    /^(.+?)\s+(hours|hrs|hr)$/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(label.trim());
    if (!match?.[1]) {
      continue;
    }

    const candidate = match[1].trim();
    return isUnitLikeText(candidate) ? candidate : null;
  }

  return null;
}

function buildFieldCandidate<TValue>(params: {
  value: TValue | null;
  confidence: WorksheetPublishFieldConfidence;
  anchors?: SelectionAnchor[];
}): FieldCandidate<TValue> {
  return {
    value: params.value,
    confidence: params.confidence,
    anchors: params.anchors ?? [],
  };
}

function buildAnchor(worksheet: WorksheetData, rowIndex: number, columnIndex: number): SelectionAnchor | null {
  const row = worksheet.rows[rowIndex];
  const column = worksheet.columns[columnIndex];

  if (!row || !column) {
    return null;
  }

  return {
    cellKey: buildWorksheetCellKey(column.id, row.id),
    rowId: row.id,
    rowIndex,
    rowLabel: row.id,
    columnId: column.id,
    columnIndex,
    columnLabel: column.label,
  };
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function valuesAreEquivalent(left: number, right: number, tolerance = 0.0001) {
  return Math.abs(left - right) <= tolerance;
}

function collectSelectionAnalyses(params: {
  worksheet: WorksheetData;
  selectionRange: WorksheetSelectionRange;
  selectionRanges?: WorksheetSelectionRange[];
}) {
  const selectedCellsByKey = new Map<string, SelectedCellAnalysis>();
  const ranges = params.selectionRanges && params.selectionRanges.length > 0
    ? params.selectionRanges
    : [params.selectionRange];

  for (const range of ranges) {
    for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
      const row = params.worksheet.rows[rowIndex];
      if (!row) {
        continue;
      }

      for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
        const column = params.worksheet.columns[columnIndex];
        if (!column) {
          continue;
        }

        const anchor = buildAnchor(params.worksheet, rowIndex, columnIndex);
        if (!anchor) {
          continue;
        }

        const cellKey = buildWorksheetCellKey(column.id, row.id);
        if (selectedCellsByKey.has(cellKey)) {
          continue;
        }

        const cell = params.worksheet.cells[cellKey];
        const displayValue = getCellDisplayValue(cell);
        const numericValue = getCellNumericValue(cell);
        selectedCellsByKey.set(cellKey, {
          anchor,
          cell,
          displayValue,
          numericValue,
        } satisfies SelectedCellAnalysis);
      }
    }
  }

  const selectedCellsInSelectionOrder = Array.from(selectedCellsByKey.values());
  const selectedCells = [...selectedCellsInSelectionOrder].sort((left, right) =>
    left.anchor.rowIndex - right.anchor.rowIndex || left.anchor.columnIndex - right.anchor.columnIndex,
  );
  const rowAnalysesByIndex = new Map<number, SelectedCellAnalysis[]>();
  for (const analysis of selectedCells) {
    const rowCells = rowAnalysesByIndex.get(analysis.anchor.rowIndex) ?? [];
    rowCells.push(analysis);
    rowAnalysesByIndex.set(analysis.anchor.rowIndex, rowCells);
  }

  const rowAnalyses = Array.from(rowAnalysesByIndex.entries())
    .sort(([left], [right]) => left - right)
    .map(([rowIndex, rowCells]) => {
      const row = params.worksheet.rows[rowIndex];
      const rowLabel = row?.id ?? String(rowIndex + 1);
      return {
        rowIndex,
        rowId: row?.id ?? rowLabel,
        rowLabel,
        cells: rowCells,
        textCells: rowCells.filter((entry) => entry.numericValue === null && isMeaningfulText(entry.displayValue)),
        numericCells: rowCells.filter((entry) => entry.numericValue !== null),
      } satisfies SelectedRowAnalysis;
    });

  return {
    selectedCells,
    selectedCellsInSelectionOrder,
    rowAnalyses,
    visibleSelectedValues: selectedCells
      .map((entry) => entry.displayValue)
      .filter((value) => value.trim().length > 0),
  };
}

function buildBlankPrefill(): DraftPrefill {
  return {
    description: buildFieldCandidate<string>({ value: null, confidence: "low" }),
    quantity: buildFieldCandidate<number>({ value: null, confidence: "low" }),
    unit: buildFieldCandidate<string>({ value: null, confidence: "low" }),
    rate: buildFieldCandidate<number>({ value: null, confidence: "low" }),
    total: buildFieldCandidate<number>({ value: null, confidence: "low" }),
  };
}

function chooseDescriptionText(textCells: SelectedCellAnalysis[]) {
  if (textCells.length === 0) {
    return null;
  }

  const sorted = [...textCells].sort((left, right) => right.displayValue.trim().length - left.displayValue.trim().length);
  return sorted[0] ?? null;
}

function buildSelectedTextPrefill(textCells: SelectedCellAnalysis[]) {
  const unitTextCells = textCells.filter((entry) => isUnitLikeText(entry.displayValue));
  if (unitTextCells.length === 1) {
    const unitCell = unitTextCells[0]!;
    const remainingTextCells = textCells.filter((entry) => entry.anchor.cellKey !== unitCell.anchor.cellKey);
    const descriptionCell = remainingTextCells[0] ?? null;

    return {
      description: descriptionCell
        ? buildFieldCandidate<string>({
            value: descriptionCell.displayValue,
            confidence: "medium",
            anchors: [descriptionCell.anchor],
          })
        : buildFieldCandidate<string>({ value: null, confidence: "low" }),
      unit: buildFieldCandidate<string>({
        value: unitCell.displayValue,
        confidence: "medium",
        anchors: [unitCell.anchor],
      }),
    } satisfies Pick<DraftPrefill, "description" | "unit">;
  }

  if (unitTextCells.length > 1) {
    return {
      description: textCells[0]
        ? buildFieldCandidate<string>({
            value: textCells[0].displayValue,
            confidence: "medium",
            anchors: [textCells[0].anchor],
          })
        : buildFieldCandidate<string>({ value: null, confidence: "low" }),
      unit: buildFieldCandidate<string>({ value: null, confidence: "low" }),
    } satisfies Pick<DraftPrefill, "description" | "unit">;
  }

  return {
    description: textCells[0]
      ? buildFieldCandidate<string>({
          value: textCells[0].displayValue,
          confidence: "medium",
          anchors: [textCells[0].anchor],
        })
      : buildFieldCandidate<string>({ value: null, confidence: "low" }),
    unit: buildFieldCandidate<string>({ value: null, confidence: "low" }),
  } satisfies Pick<DraftPrefill, "description" | "unit">;
}

function buildSingleRowPrefill(row: SelectedRowAnalysis): DraftPrefill | null {
  if (row.textCells.length === 0) {
    return null;
  }

  const nonUnitTextCells = row.textCells.filter((entry) => !isUnitLikeText(entry.displayValue));
  const selectedTextPrefill = buildSelectedTextPrefill(row.textCells);
  if (nonUnitTextCells.length > 1 && selectedTextPrefill.description.value === null) {
    return null;
  }

  const descriptionCell = chooseDescriptionText(nonUnitTextCells) ?? chooseDescriptionText(row.textCells);

  if (!descriptionCell && selectedTextPrefill.description.value === null) {
    return null;
  }

  const unitCell =
    descriptionCell
      ? row.textCells.find((entry) => entry.anchor.cellKey !== descriptionCell.anchor.cellKey && isUnitLikeText(entry.displayValue)) ?? null
      : null;
  const normalizedDescription = normalizeLabel(descriptionCell?.displayValue);
  const numericCells = row.numericCells;

  let quantity: FieldCandidate<number> = buildFieldCandidate<number>({ value: null, confidence: "low" });
  let rate: FieldCandidate<number> = buildFieldCandidate<number>({ value: null, confidence: "low" });
  let total: FieldCandidate<number> = buildFieldCandidate<number>({ value: null, confidence: "low" });

  if (numericCells.length >= 3) {
    const [first, second, third] = numericCells;
    quantity = buildFieldCandidate<number>({
      value: first?.numericValue ?? null,
      confidence: "medium",
      anchors: first ? [first.anchor] : [],
    });
    rate = buildFieldCandidate<number>({
      value: second?.numericValue ?? null,
      confidence: "medium",
      anchors: second ? [second.anchor] : [],
    });
    total = buildFieldCandidate<number>({
      value: third?.numericValue ?? null,
      confidence:
        first?.numericValue !== null &&
        second?.numericValue !== null &&
        third?.numericValue !== null &&
        valuesAreEquivalent(roundTo(first.numericValue * second.numericValue, 2), third.numericValue)
          ? "high"
          : "medium",
      anchors: third ? [third.anchor] : [],
    });
  } else if (numericCells.length === 2) {
    const [first, second] = numericCells;

    if (includesAny(normalizedDescription, ["qty", "quantity", "required", "hours", "hrs"])) {
      quantity = buildFieldCandidate<number>({
        value: first?.numericValue ?? null,
        confidence: "medium",
        anchors: first ? [first.anchor] : [],
      });
      total = buildFieldCandidate<number>({
        value: second?.numericValue ?? null,
        confidence: "low",
        anchors: second ? [second.anchor] : [],
      });
    } else if (includesAny(normalizedDescription, ["rate", "price", "cost per", "unit rate"])) {
      rate = buildFieldCandidate<number>({
        value: first?.numericValue ?? null,
        confidence: "medium",
        anchors: first ? [first.anchor] : [],
      });
      total = buildFieldCandidate<number>({
        value: second?.numericValue ?? null,
        confidence: "low",
        anchors: second ? [second.anchor] : [],
      });
    } else {
      quantity = buildFieldCandidate<number>({
        value: first?.numericValue ?? null,
        confidence: "low",
        anchors: first ? [first.anchor] : [],
      });
      rate = buildFieldCandidate<number>({
        value: second?.numericValue ?? null,
        confidence: "low",
        anchors: second ? [second.anchor] : [],
      });
    }
  } else if (numericCells.length === 1) {
    const [numeric] = numericCells;

    if (includesAny(normalizedDescription, ["qty", "quantity", "required", "hours", "hrs"])) {
      quantity = buildFieldCandidate<number>({
        value: numeric?.numericValue ?? null,
        confidence: "medium",
        anchors: numeric ? [numeric.anchor] : [],
      });
    } else if (includesAny(normalizedDescription, ["rate", "price", "cost per", "unit rate"])) {
      rate = buildFieldCandidate<number>({
        value: numeric?.numericValue ?? null,
        confidence: "medium",
        anchors: numeric ? [numeric.anchor] : [],
      });
    } else if (includesAny(normalizedDescription, ["total", "cost", "amount", "value", "sum"])) {
      total = buildFieldCandidate<number>({
        value: numeric?.numericValue ?? null,
        confidence: "medium",
        anchors: numeric ? [numeric.anchor] : [],
      });
    } else if (unitCell) {
      quantity = buildFieldCandidate<number>({
        value: numeric?.numericValue ?? null,
        confidence: "medium",
        anchors: numeric ? [numeric.anchor] : [],
      });
    }
  }

  return {
    description:
      nonUnitTextCells.length > 1
        ? selectedTextPrefill.description
        : buildFieldCandidate<string>({
            value: descriptionCell?.displayValue ?? null,
            confidence: "high",
            anchors: descriptionCell ? [descriptionCell.anchor] : [],
          }),
    quantity,
    unit:
      nonUnitTextCells.length > 1
        ? selectedTextPrefill.unit
        : buildFieldCandidate<string>({
            value: unitCell?.displayValue ?? inferUnitFromLabel(descriptionCell?.displayValue ?? null),
            confidence: unitCell ? "medium" : inferUnitFromLabel(descriptionCell?.displayValue ?? null) ? "medium" : "low",
            anchors: unitCell ? [unitCell.anchor] : descriptionCell ? [descriptionCell.anchor] : [],
          }),
    rate,
    total,
  };
}

function buildCalculatorBlockPrefill(rows: SelectedRowAnalysis[]): DraftPrefill | null {
  const candidates = rows.filter((row) => row.textCells.length >= 1 && row.numericCells.length === 1);
  if (candidates.length < 3) {
    return null;
  }

  for (const totalRow of candidates) {
    const totalValue = totalRow.numericCells[0]?.numericValue;
    if (totalValue === null || totalValue === undefined) {
      continue;
    }

    for (const quantityRow of candidates) {
      if (quantityRow.rowIndex === totalRow.rowIndex) {
        continue;
      }

      const quantityValue = quantityRow.numericCells[0]?.numericValue;
      if (quantityValue === null || quantityValue === undefined) {
        continue;
      }

      for (const rateRow of candidates) {
        if (rateRow.rowIndex === totalRow.rowIndex || rateRow.rowIndex === quantityRow.rowIndex) {
          continue;
        }

        const rateValue = rateRow.numericCells[0]?.numericValue;
        if (rateValue === null || rateValue === undefined) {
          continue;
        }

        if (!valuesAreEquivalent(roundTo(quantityValue * rateValue, 2), totalValue)) {
          continue;
        }

        const descriptionCell = chooseDescriptionText(totalRow.textCells);
        const quantityText = chooseDescriptionText(quantityRow.textCells);
        const rateText = chooseDescriptionText(rateRow.textCells);

        if (!descriptionCell || !quantityText || !rateText) {
          continue;
        }

        const inferredUnit = inferUnitFromLabel(quantityText.displayValue);

        return {
          description: buildFieldCandidate<string>({
            value: descriptionCell.displayValue,
            confidence: "high",
            anchors: [descriptionCell.anchor],
          }),
          quantity: buildFieldCandidate<number>({
            value: quantityValue,
            confidence: "high",
            anchors: [quantityRow.numericCells[0]!.anchor],
          }),
          unit: buildFieldCandidate<string>({
            value: inferredUnit,
            confidence: inferredUnit ? "medium" : "low",
            anchors: inferredUnit ? [quantityText.anchor] : [],
          }),
          rate: buildFieldCandidate<number>({
            value: rateValue,
            confidence: "high",
            anchors: [rateRow.numericCells[0]!.anchor],
          }),
          total: buildFieldCandidate<number>({
            value: totalValue,
            confidence: "high",
            anchors: [totalRow.numericCells[0]!.anchor],
          }),
        };
      }
    }
  }

  return null;
}

function buildSelectionDescriptionPrefill(selectedCells: SelectedCellAnalysis[]): FieldCandidate<string> {
  const textCells = selectedCells.filter((entry) => entry.numericValue === null && isMeaningfulText(entry.displayValue));
  if (textCells.length === 1) {
    return buildFieldCandidate<string>({
      value: textCells[0]!.displayValue,
      confidence: "medium",
      anchors: [textCells[0]!.anchor],
    });
  }

  return buildFieldCandidate<string>({ value: null, confidence: "low" });
}

function buildScatteredSelectionPrefill(selectedCells: SelectedCellAnalysis[]): DraftPrefill {
  const blank = buildBlankPrefill();
  const textCells = selectedCells.filter((entry) => entry.numericValue === null && isMeaningfulText(entry.displayValue));
  const nonUnitTextCells = textCells.filter((entry) => !isUnitLikeText(entry.displayValue));
  const unitTextCells = textCells.filter((entry) => isUnitLikeText(entry.displayValue));
  const numericCells = selectedCells.filter((entry) => entry.numericValue !== null);
  const selectedTextPrefill = buildSelectedTextPrefill(textCells);

  const description =
    nonUnitTextCells.length === 1
      ? buildFieldCandidate<string>({
          value: nonUnitTextCells[0]!.displayValue,
          confidence: "medium",
          anchors: [nonUnitTextCells[0]!.anchor],
        })
      : selectedTextPrefill.description;
  const unit =
    unitTextCells.length === 1
      ? buildFieldCandidate<string>({
          value: unitTextCells[0]!.displayValue,
          confidence: "medium",
          anchors: [unitTextCells[0]!.anchor],
        })
      : selectedTextPrefill.unit;

  if (numericCells.length !== 3) {
    return {
      ...blank,
      description,
      unit,
    };
  }

  for (let totalIndex = 0; totalIndex < numericCells.length; totalIndex += 1) {
    const totalCell = numericCells[totalIndex]!;
    const factors = numericCells.filter((_, index) => index !== totalIndex);
    const left = factors[0]!;
    const right = factors[1]!;
    if (
      left.numericValue === null ||
      right.numericValue === null ||
      totalCell.numericValue === null ||
      !valuesAreEquivalent(roundTo(left.numericValue * right.numericValue, 2), totalCell.numericValue)
    ) {
      continue;
    }

    const [quantityCell, rateCell] =
      Math.abs(left.numericValue) >= Math.abs(right.numericValue)
        ? [left, right]
        : [right, left];

    return {
      ...blank,
      description,
      unit,
      quantity: buildFieldCandidate<number>({
        value: quantityCell.numericValue,
        confidence: "medium",
        anchors: [quantityCell.anchor],
      }),
      rate: buildFieldCandidate<number>({
        value: rateCell.numericValue,
        confidence: "medium",
        anchors: [rateCell.anchor],
      }),
      total: buildFieldCandidate<number>({
        value: totalCell.numericValue,
        confidence: "high",
        anchors: [totalCell.anchor],
      }),
    };
  }

  return {
    ...blank,
    description,
    unit,
  };
}

function buildLightPrefill(params: {
  selectedCells: SelectedCellAnalysis[];
  rowAnalyses: SelectedRowAnalysis[];
  useScatteredSelectionPrefill?: boolean;
}): DraftPrefill {
  if (params.useScatteredSelectionPrefill) {
    return buildScatteredSelectionPrefill(params.selectedCells);
  }

  const calculatorPrefill = buildCalculatorBlockPrefill(params.rowAnalyses);
  if (calculatorPrefill) {
    return calculatorPrefill;
  }

  const singleRowCandidates = params.rowAnalyses
    .map((row) => ({ row, prefill: buildSingleRowPrefill(row) }))
    .filter((entry): entry is { row: SelectedRowAnalysis; prefill: DraftPrefill } => Boolean(entry.prefill))
    .sort((left, right) => right.row.numericCells.length - left.row.numericCells.length || right.row.textCells.length - left.row.textCells.length);

  if (singleRowCandidates[0]?.prefill) {
    return singleRowCandidates[0].prefill;
  }

  const blank = buildBlankPrefill();
  return {
    ...blank,
    description: buildSelectionDescriptionPrefill(params.selectedCells),
  };
}

function buildConfidenceWarning(fieldName: string, candidate: FieldCandidate<unknown>) {
  if (candidate.value === null || candidate.value === "") {
    return null;
  }

  if (candidate.confidence === "low") {
    return `${fieldName} was left as a light suggestion only.`;
  }

  return null;
}

function buildWorksheetMetadataForConfirmedLine(params: {
  worksheet: WorksheetData;
  originalSelectionRange: WorksheetSelectionRange;
  originalSelectionRanges: WorksheetSelectionRange[];
  selectionRangeLabel: string;
  proposal: ProposedCommercialLine;
  confirmedLine: ConfirmedCommercialLineInput;
  visibleSelectedValues: string[];
}) {
  return {
    worksheetPublishV2: {
      version: 2,
      originalSelectionRangeLabel: buildWorksheetSelectionRangeLabel(params.worksheet, params.originalSelectionRange),
      originalSelectionRanges: params.originalSelectionRanges.map((range) => ({
        startRowIndex: range.startRowIndex,
        endRowIndex: range.endRowIndex,
        startColumnIndex: range.startColumnIndex,
        endColumnIndex: range.endColumnIndex,
        rangeLabel: buildWorksheetSelectionRangeLabel(params.worksheet, range),
      })),
      selectionSummary: params.selectionRangeLabel,
      selectedValues: params.visibleSelectedValues,
      prefill: {
        description: params.proposal.description.value,
        quantity: params.proposal.quantity.value,
        unit: params.proposal.unit.value,
        rate: params.proposal.rate.value,
        total: params.proposal.total.value,
      },
      fieldMappings: {
        description: params.proposal.description.anchors.map((anchor) => anchor.cellKey),
        quantity: params.proposal.quantity.anchors.map((anchor) => anchor.cellKey),
        unit: params.proposal.unit.anchors.map((anchor) => anchor.cellKey),
        rate: params.proposal.rate.anchors.map((anchor) => anchor.cellKey),
        total: params.proposal.total.anchors.map((anchor) => anchor.cellKey),
      },
      confirmedLine: {
        description: params.confirmedLine.description,
        quantity: params.confirmedLine.quantity,
        unit: params.confirmedLine.unit,
        rate: params.confirmedLine.rate,
        total: params.confirmedLine.total,
      },
      edits: {
        descriptionChanged: params.proposal.description.value !== params.confirmedLine.description,
        quantityChanged: params.proposal.quantity.value !== params.confirmedLine.quantity,
        unitChanged: params.proposal.unit.value !== params.confirmedLine.unit,
        rateChanged: params.proposal.rate.value !== params.confirmedLine.rate,
        totalChanged: params.proposal.total.value !== params.confirmedLine.total,
      },
    },
  } satisfies Record<string, Json>;
}

function mergeLockedMetadata(params: {
  lockedMetadata: CommercialItemLockedMetadataPayload;
  worksheetMetadata: Record<string, Json>;
}) {
  return {
    ...params.lockedMetadata,
    worksheetMetadata: {
      ...params.lockedMetadata.worksheetMetadata,
      ...params.worksheetMetadata,
    },
  } satisfies CommercialItemLockedMetadataPayload;
}

function countUniqueSelectedCells(ranges: WorksheetSelectionRange[]) {
  const cellKeys = new Set<string>();

  for (const range of ranges) {
    for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
      for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
        cellKeys.add(`${rowIndex}:${columnIndex}`);
      }
    }
  }

  return cellKeys.size;
}

function countUniqueSelectedRows(ranges: WorksheetSelectionRange[]) {
  const rowIndexes = new Set<number>();

  for (const range of ranges) {
    for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
      rowIndexes.add(rowIndex);
    }
  }

  return rowIndexes.size;
}

function countUniqueSelectedColumns(ranges: WorksheetSelectionRange[]) {
  const columnIndexes = new Set<number>();

  for (const range of ranges) {
    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      columnIndexes.add(columnIndex);
    }
  }

  return columnIndexes.size;
}

export function interpretWorksheetSelectionForPublish(params: {
  destination: PublishedWorksheetSelection["destination"];
  worksheet: WorksheetData;
  selectionRange: WorksheetSelectionRange;
  selectionRanges?: WorksheetSelectionRange[];
}) {
  const selectionRanges = params.selectionRanges && params.selectionRanges.length > 0
    ? params.selectionRanges
    : [params.selectionRange];
  const primaryRangeLabel = buildWorksheetSelectionRangeLabel(params.worksheet, params.selectionRange);
  const { selectedCells, selectedCellsInSelectionOrder, rowAnalyses, visibleSelectedValues } = collectSelectionAnalyses({
    worksheet: params.worksheet,
    selectionRange: params.selectionRange,
    selectionRanges,
  });
  const selectionRangeLabels = selectionRanges.map((range) => buildWorksheetSelectionRangeLabel(params.worksheet, range));
  const selectionRangeLabel =
    selectionRanges.length > 1
      ? `${selectedCells.length} selected cell${selectedCells.length === 1 ? "" : "s"} on ${params.worksheet.sheetName || "this sheet"}`
      : primaryRangeLabel;
  const prefill = buildLightPrefill({
    selectedCells: selectionRanges.length > 1 ? selectedCellsInSelectionOrder : selectedCells,
    rowAnalyses,
    useScatteredSelectionPrefill: selectionRanges.length > 1,
  });
  const warnings = [
    buildConfidenceWarning("Description", prefill.description),
    buildConfidenceWarning("Quantity", prefill.quantity),
    buildConfidenceWarning("Unit", prefill.unit),
    buildConfidenceWarning("Rate", prefill.rate),
    buildConfidenceWarning("Total", prefill.total),
  ].filter((warning): warning is string => Boolean(warning));

  return {
    destination: params.destination,
    selectionRange: params.selectionRange,
    primaryRangeLabel,
    selectionRangeLabel,
    selectionRanges,
    selectionRangeLabels,
    proposedLines: [
      {
        id: "selection-line-0",
        rowId: "selection-line-0",
        rowIndex: params.selectionRange.startRowIndex,
        rowLabel: selectionRangeLabel,
        sourceRange: params.selectionRange,
        sourceRangeLabel: primaryRangeLabel,
        sourceSummary: selectionRangeLabel,
        sectionHeading: null,
        warnings,
        includeByDefault: true,
        description: prefill.description,
        quantity: prefill.quantity,
        unit: prefill.unit,
        rate: prefill.rate,
        total: prefill.total,
      },
    ],
    skippedRows: [],
    warnings: [],
    visibleSelectedValues,
  } satisfies InterpretedWorksheetSelection;
}

export function buildPublishedWorksheetSelectionFromConfirmedLines(params: {
  destination: PublishedWorksheetSelection["destination"];
  worksheet: WorksheetData;
  selectionRange: WorksheetSelectionRange;
  selectionRanges?: WorksheetSelectionRange[];
  workbookId: string;
  worksheetId: string;
  sheetId: string;
  worksheetName: string;
  sheetName: string;
  owner?: PricingWorksheetOwnerContextValue | null;
  interpretedSelection: InterpretedWorksheetSelection;
  confirmedLines: ConfirmedCommercialLineInput[];
}) {
  const confirmedByProposalId = new Map(params.confirmedLines.map((line) => [line.proposalId, line]));
  const commercialRows: PublishedWorksheetSelection["commercialRows"] = [];
  const originalRangeLabel = params.interpretedSelection.selectionRangeLabel;
  const originalSelectionRanges = params.selectionRanges && params.selectionRanges.length > 0
    ? params.selectionRanges
    : [params.selectionRange];
  const isMultiSelection = originalSelectionRanges.length > 1;

  for (const proposal of params.interpretedSelection.proposedLines) {
    const confirmedLine = confirmedByProposalId.get(proposal.id);
    if (!confirmedLine) {
      continue;
    }

    const snapshot = buildCommercialItemWorksheetSnapshot({
      worksheet: params.worksheet,
      range: params.selectionRange,
      sheetName: params.sheetName,
    });
    const snapshotWithSelectionSummary = isMultiSelection
      ? {
          ...snapshot,
          rangeLabel: originalRangeLabel,
          rowCount: countUniqueSelectedRows(originalSelectionRanges),
          columnCount: countUniqueSelectedColumns(originalSelectionRanges),
          cellCount: countUniqueSelectedCells(originalSelectionRanges),
        }
      : snapshot;
    const sourceLink = buildCommercialItemSourceLink({
      workbookId: params.workbookId,
      worksheetId: params.worksheetId,
      sheetId: params.sheetId,
      worksheetName: params.worksheetName,
      sheetName: params.sheetName,
      worksheet: params.worksheet,
      range: params.selectionRange,
      owner: params.owner,
    });
    const sourceLinkWithSelectionSummary = isMultiSelection
      ? {
          ...sourceLink,
          range: originalRangeLabel,
          rowCount: countUniqueSelectedRows(originalSelectionRanges),
          columnCount: countUniqueSelectedColumns(originalSelectionRanges),
          cellCount: countUniqueSelectedCells(originalSelectionRanges),
        }
      : sourceLink;
    const lockedMetadata = mergeLockedMetadata({
      lockedMetadata: isMultiSelection
        ? {
            ...buildCommercialItemLockedMetadata({
              worksheet: params.worksheet,
              range: params.selectionRange,
              sheetName: params.sheetName,
            }),
            rangeLabel: originalRangeLabel,
          }
        : buildCommercialItemLockedMetadata({
            worksheet: params.worksheet,
            range: params.selectionRange,
            sheetName: params.sheetName,
          }),
      worksheetMetadata: buildWorksheetMetadataForConfirmedLine({
        worksheet: params.worksheet,
        originalSelectionRange: params.selectionRange,
        originalSelectionRanges,
        selectionRangeLabel: params.interpretedSelection.selectionRangeLabel,
        proposal,
        confirmedLine,
        visibleSelectedValues: params.interpretedSelection.visibleSelectedValues,
      }),
    });
    const sourceSignature = buildCommercialItemSourceSignature({
      workbookId: params.workbookId,
      sheetId: params.sheetId,
      worksheet: params.worksheet,
      range: params.selectionRange,
      fingerprint: {
        proposalId: proposal.id,
        selectionRanges: params.interpretedSelection.selectionRangeLabels,
        description: confirmedLine.description,
        quantity: confirmedLine.quantity,
        unit: confirmedLine.unit,
        rate: confirmedLine.rate,
        total: confirmedLine.total,
      } as unknown as Json,
    });

    commercialRows.push({
      rowId: proposal.id,
      rowIndex: proposal.rowIndex,
      rowLabel: proposal.rowLabel,
      sourceRowIndex: proposal.rowIndex,
      sourceRange: params.selectionRange,
      sourceRangeLabel: originalRangeLabel,
      sectionHeading: proposal.sectionHeading,
      rowCategoryHint: proposal.sectionHeading,
      description: confirmedLine.description,
      quantity: confirmedLine.quantity,
      unit: confirmedLine.unit,
      rate: confirmedLine.rate,
      total: confirmedLine.total,
      snapshotJson: snapshotWithSelectionSummary as unknown as Json,
      sourceLinkJson: sourceLinkWithSelectionSummary as unknown as Json,
      lockedMetadataJson: lockedMetadata as unknown as Json,
      sourceSignature,
    });
  }

  return {
    destination: params.destination,
    selectionRange: params.selectionRange,
    commercialRows,
    skippedRows: [
      ...params.interpretedSelection.skippedRows,
      ...params.interpretedSelection.proposedLines
        .filter((proposal) => !confirmedByProposalId.has(proposal.id))
        .map((proposal) => ({
          rowId: proposal.id,
          rowIndex: proposal.rowIndex,
          rowLabel: proposal.rowLabel,
          reason: "not_selected" as const,
        })),
    ],
  } satisfies PublishedWorksheetSelection;
}
