// Concrete producer contract: only normalized strings and arrays of string pairs
// reach result_json. Type aliases retain structural compatibility with Supabase Json.
type StructuredItem = {
  title: string;
  description: string;
}

export type ChangeDetectionResponsePayload = {
  tradeLabel: string;
  revisionSummary: StructuredItem[];
  addedScope: StructuredItem[];
  removedScope: StructuredItem[];
  modifiedScope: StructuredItem[];
  quantityOrSizeChanges: StructuredItem[];
  coordinationChanges: StructuredItem[];
  costImpactChanges: StructuredItem[];
  risksClarifications: StructuredItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toStructuredItemFromString(value: string): StructuredItem | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const delimiters = [" — ", " – ", " - ", ": ", "; "];
  for (const delimiter of delimiters) {
    const index = normalized.indexOf(delimiter);
    if (index > 1 && index < 80) {
      const title = normalized.slice(0, index).trim();
      const description = normalized.slice(index + delimiter.length).trim();
      if (title && description) {
        return { title, description };
      }
    }
  }

  return {
    title: normalized,
    description: "Not specified in drawings",
  };
}

function toStructuredItemArray(value: unknown): StructuredItem[] {
  if (typeof value === "string") {
    const parsed = toStructuredItemFromString(value);
    return parsed ? [parsed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: StructuredItem[] = [];
  for (const entry of value) {
    if (isRecord(entry)) {
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      if (title && description) {
        normalized.push({ title, description });
      }
      continue;
    }

    if (typeof entry === "string") {
      const parsed = toStructuredItemFromString(entry);
      if (parsed) {
        normalized.push(parsed);
      }
    }
  }

  return normalized;
}

export function toChangeDetectionPayload(value: unknown): ChangeDetectionResponsePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const tradeLabel = typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "";
  const revisionSummary = toStructuredItemArray(value.revisionSummary);
  const addedScope = toStructuredItemArray(value.addedScope);
  const removedScope = toStructuredItemArray(value.removedScope);
  const modifiedScope = toStructuredItemArray(value.modifiedScope);
  const quantityOrSizeChanges = toStructuredItemArray(value.quantityOrSizeChanges);
  const coordinationChanges = toStructuredItemArray(value.coordinationChanges);
  const costImpactChanges = toStructuredItemArray(value.costImpactChanges);
  const risksClarifications = toStructuredItemArray(value.risksClarifications);

  if (!tradeLabel) {
    return null;
  }

  return {
    tradeLabel,
    revisionSummary,
    addedScope,
    removedScope,
    modifiedScope,
    quantityOrSizeChanges,
    coordinationChanges,
    costImpactChanges,
    risksClarifications,
  };
}
