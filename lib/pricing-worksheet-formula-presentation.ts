import {
  extractPricingWorksheetFormulaReferences,
  type PricingWorksheetFormulaReference,
} from "@/lib/pricing-worksheet-formula-references";

export type PricingWorksheetFormulaPresentationSegment = {
  text: string;
  colorIndex: number | null;
  normalizedRef: string | null;
};

export type PricingWorksheetColoredFormulaReference = PricingWorksheetFormulaReference & {
  colorIndex: number;
};

export function buildPricingWorksheetFormulaPresentation(formula: string) {
  const colorIndexByReference = new Map<string, number>();
  const references: PricingWorksheetColoredFormulaReference[] =
    extractPricingWorksheetFormulaReferences(formula).map((reference) => {
      let colorIndex = colorIndexByReference.get(reference.normalizedRef);
      if (typeof colorIndex !== "number") {
        colorIndex = colorIndexByReference.size;
        colorIndexByReference.set(reference.normalizedRef, colorIndex);
      }
      return { ...reference, colorIndex };
    });
  const segments: PricingWorksheetFormulaPresentationSegment[] = [];
  let cursor = 0;

  for (const reference of references) {
    if (reference.start > cursor) {
      segments.push({
        text: formula.slice(cursor, reference.start),
        colorIndex: null,
        normalizedRef: null,
      });
    }
    segments.push({
      text: formula.slice(reference.start, reference.end),
      colorIndex: reference.colorIndex,
      normalizedRef: reference.normalizedRef,
    });
    cursor = reference.end;
  }

  if (cursor < formula.length || segments.length === 0) {
    segments.push({
      text: formula.slice(cursor),
      colorIndex: null,
      normalizedRef: null,
    });
  }

  return { references, segments };
}

export function getWorksheetCaretIndexFromTextMetrics(params: {
  value: string;
  contentX: number;
  measureText: (value: string) => number;
  scale?: number;
}) {
  if (!params.value) {
    return 0;
  }

  const scale = params.scale && params.scale > 0 ? params.scale : 1;
  const targetX = Math.max(0, params.contentX / scale);
  let previousWidth = 0;

  for (let index = 1; index <= params.value.length; index += 1) {
    const nextWidth = params.measureText(params.value.slice(0, index));
    if (targetX <= (previousWidth + nextWidth) / 2) {
      return index - 1;
    }
    previousWidth = nextWidth;
  }

  return params.value.length;
}
