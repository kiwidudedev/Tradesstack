export function formatFileSize(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "Unknown size";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatUploadedAt(value: string | null): string {
  if (!value) {
    return "Upload date unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Upload date unavailable";
  }

  return `Uploaded ${date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function formatMeasurementValue(params: {
  measurementKind: "line" | "area" | "count";
  displayValue: number | null;
  displayUnit: string | null;
  countValue: number | null;
}): string {
  if (params.measurementKind === "count") {
    return `${params.countValue ?? 0} items`;
  }

  if (typeof params.displayValue !== "number" || !Number.isFinite(params.displayValue)) {
    return "Not calculated";
  }

  const suffix = params.displayUnit ?? "";
  return `${params.displayValue.toFixed(2)} ${suffix}`.trim();
}
