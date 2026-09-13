import { formatCountValue, formatQuantityValue } from "./measurement-display";
import type { QuantityTableRow } from "./quantities-adapter";

export interface QuantityGroupTotal {
  kind: "Area" | "Perimeter" | "Linear" | "Count";
  unit: string;
  value: number;
}

export function aggregateTakeoffQuantityRows(rows: QuantityTableRow[]): QuantityGroupTotal[] {
  const totals = new Map<string, QuantityGroupTotal>();
  const add = (kind: QuantityGroupTotal["kind"], unit: string, value: number | null) => {
    if (value === null || !Number.isFinite(value)) return;
    const key = `${kind}:${unit}`;
    const current = totals.get(key);
    totals.set(key, { kind, unit, value: (current?.value ?? 0) + value });
  };

  for (const row of rows) {
    if (row.typeLabel === "Area") {
      add("Area", row.unitLabel, row.quantityValue);
      if (row.secondaryUnitLabel) add("Perimeter", row.secondaryUnitLabel, row.secondaryQuantityValue);
    } else if (row.typeLabel === "Linear") {
      add("Linear", row.unitLabel, row.quantityValue);
    } else {
      add("Count", "count", row.quantityValue);
    }
  }

  return Array.from(totals.values());
}

export function formatTakeoffQuantityGroupTotals(totals: QuantityGroupTotal[]): string {
  return totals
    .map((total) =>
      total.kind === "Count"
        ? `Count ${formatCountValue(total.value)}`
        : `${total.kind} ${formatQuantityValue(total.value, total.unit)}`
    )
    .join(" • ");
}
