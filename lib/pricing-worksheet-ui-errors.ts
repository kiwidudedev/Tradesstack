const INTERNAL_ERROR_PATTERNS = [
  "permission denied",
  "row-level security",
  "rls",
  "intelligence_events",
  "violates",
  "constraint",
  "duplicate key",
  "foreign key",
  "postgres",
  "postgresql",
  "sql state",
  "relation ",
  "column ",
  "schema ",
  "table ",
  "policy ",
  "cannot coerce",
  "single json object",
] as const;

export function mapPricingWorksheetUiErrorMessage(error: unknown, fallbackMessage: string) {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const message = error.message.trim();
  if (!message) {
    return fallbackMessage;
  }

  const normalizedMessage = message.toLowerCase();
  if (INTERNAL_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))) {
    return fallbackMessage;
  }

  return message;
}
