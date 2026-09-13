const SUPPLIER_BILL_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function assertCalendarDate(year: number, month: number, day: number, sourceField: string) {
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    throw new Error(`${sourceField} contains an invalid calendar date.`);
  }
}

/**
 * Canonicalizes a proven Supplier Bill timestamptz value to UTC while retaining
 * PostgreSQL microsecond precision. Null and undefined remain optional; every
 * supplied non-null value must be unambiguous and valid.
 */
export function normalizeSupplierBillUclTimestamp(
  value: unknown,
  sourceField = "Supplier Bill timestamp",
): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error(`${sourceField} contains an invalid Date object.`);
    }
    return normalizeSupplierBillUclTimestamp(value.toISOString(), sourceField);
  }

  if (typeof value !== "string") {
    throw new Error(`${sourceField} must be a timestamp string, Date object, or null.`);
  }

  const match = value.match(SUPPLIER_BILL_TIMESTAMP_PATTERN);
  if (!match) {
    throw new Error(
      `${sourceField} must be an ISO 8601 timestamp with an explicit Z or ±HH:MM timezone.`,
    );
  }

  const [, yearText, monthText, dayText, , , , fractional = ""] = match;
  assertCalendarDate(
    Number(yearText),
    Number(monthText),
    Number(dayText),
    sourceField,
  );

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${sourceField} contains an invalid ISO 8601 timestamp.`);
  }

  const utcToSecond = new Date(milliseconds).toISOString().slice(0, 19);
  return `${utcToSecond}.${fractional.padEnd(6, "0")}Z`;
}

export function isValidSupplierBillUclTimestamp(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    return normalizeSupplierBillUclTimestamp(value) !== null;
  } catch {
    return false;
  }
}
