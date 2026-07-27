export interface ClaimLineSnapshotIdentity {
  sourceKind: "Quote" | "Variation";
  sourceDocumentId: string;
  sourceLineItemId: string;
}

export interface ClaimLineItemSnapshot extends ClaimLineSnapshotIdentity {
  id: string;
  sourceNumber: string;
  sourceTitle: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourceTotal: number;
  previouslyClaimedAmount: number;
  previouslyClaimedPercent: number;
  claimPercent: number;
  claimAmount: number;
  cumulativeClaimedAmount: number;
  cumulativeClaimedPercent: number;
  sortOrder: number;
}

const FALLBACK_LINE_DESCRIPTION = "Untitled line item";

function isNonBlankText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function preferSnapshotText(snapshotValue: string, liveValue: string, fallback = "") {
  if (isNonBlankText(snapshotValue)) {
    return snapshotValue;
  }
  if (isNonBlankText(liveValue)) {
    return liveValue;
  }
  return fallback;
}

function preferSnapshotNumber(snapshotValue: number, liveValue: number, fallback = 0) {
  if (Number.isFinite(snapshotValue)) {
    return snapshotValue;
  }
  if (Number.isFinite(liveValue)) {
    return liveValue;
  }
  return fallback;
}

export function getClaimLineSourceKey(row: ClaimLineSnapshotIdentity) {
  return `${row.sourceKind}:${row.sourceDocumentId}:${row.sourceLineItemId}`;
}

export function getClaimLineDescriptionText(line: Pick<ClaimLineItemSnapshot, "description">) {
  return line.description.trim() || FALLBACK_LINE_DESCRIPTION;
}

export function getClaimLineSourceText(line: Pick<ClaimLineItemSnapshot, "sourceKind" | "sourceNumber">) {
  const sourceNumber = line.sourceNumber.trim();
  return sourceNumber ? `${line.sourceKind} ${sourceNumber}` : line.sourceKind;
}

function mergePersistedClaimLineSnapshot(
  row: ClaimLineItemSnapshot,
  liveSourceRow: ClaimLineItemSnapshot | undefined,
): ClaimLineItemSnapshot {
  if (!liveSourceRow) {
    return row;
  }

  return {
    ...row,
    sourceKind: liveSourceRow.sourceKind,
    sourceDocumentId: row.sourceDocumentId || liveSourceRow.sourceDocumentId,
    sourceLineItemId: row.sourceLineItemId || liveSourceRow.sourceLineItemId,
    sourceNumber: preferSnapshotText(row.sourceNumber, liveSourceRow.sourceNumber),
    sourceTitle: preferSnapshotText(row.sourceTitle, liveSourceRow.sourceTitle),
    section: preferSnapshotText(row.section, liveSourceRow.section, "Item"),
    description: preferSnapshotText(row.description, liveSourceRow.description),
    quantity: preferSnapshotNumber(row.quantity, liveSourceRow.quantity),
    unit: preferSnapshotText(row.unit, liveSourceRow.unit),
    rate: preferSnapshotNumber(row.rate, liveSourceRow.rate),
    sourceTotal: preferSnapshotNumber(row.sourceTotal, liveSourceRow.sourceTotal),
    sortOrder: preferSnapshotNumber(row.sortOrder, liveSourceRow.sortOrder),
  };
}

export function normalizeClaimRowsAgainstLiveSource(
  rows: ClaimLineItemSnapshot[],
  liveSourceRows: ClaimLineItemSnapshot[],
) {
  const liveRowsByKey = new Map(liveSourceRows.map((row) => [getClaimLineSourceKey(row), row]));
  const normalizedRowsByKey = new Map<string, ClaimLineItemSnapshot>();

  rows.forEach((row) => {
    const normalizedRow = mergePersistedClaimLineSnapshot(row, liveRowsByKey.get(getClaimLineSourceKey(row)));
    const normalizedKey = getClaimLineSourceKey(normalizedRow);
    const existing = normalizedRowsByKey.get(normalizedKey);

    if (!existing) {
      normalizedRowsByKey.set(normalizedKey, normalizedRow);
      return;
    }

    const shouldReplace =
      normalizedRow.claimPercent > existing.claimPercent
      || normalizedRow.claimAmount > existing.claimAmount
      || normalizedRow.previouslyClaimedAmount > existing.previouslyClaimedAmount;

    if (shouldReplace) {
      normalizedRowsByKey.set(normalizedKey, normalizedRow);
    }
  });

  return Array.from(normalizedRowsByKey.values());
}
