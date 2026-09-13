import ExcelJS from "exceljs";
import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";

function cellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if ("result" in record) return String(record.result ?? record.formula ?? "");
    if (Array.isArray(record.richText)) {
      return record.richText.map((entry) => typeof entry === "object" && entry && "text" in entry ? String(entry.text) : "").join("");
    }
  }
  return String(value);
}

export async function createSpreadsheetSourceParts(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  rowsPerChunk?: number;
}): Promise<DocumentSourcePart[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input.bytes as never);
  const rowsPerChunk = Math.max(50, input.rowsPerChunk ?? 150);
  const parts: DocumentSourcePart[] = [];

  for (const worksheet of workbook.worksheets) {
    const mergedRanges = (worksheet.model as unknown as { merges?: string[] }).merges ?? [];
    for (let start = 1; start <= Math.max(worksheet.rowCount, 1); start += rowsPerChunk) {
      const end = Math.min(worksheet.rowCount, start + rowsPerChunk - 1);
      const rows: string[] = [];
      for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const cells: string[] = [];
        for (let column = 1; column <= Math.max(worksheet.columnCount, row.cellCount); column += 1) {
          const cell = row.getCell(column);
          const address = cell.address;
          const display = cell.text || cellDisplay(cell.value);
          const formula = typeof cell.value === "object" && cell.value && "formula" in cell.value
            ? ` formula=${String((cell.value as { formula: unknown }).formula)}`
            : "";
          cells.push(`${address}=${JSON.stringify(display)}${formula}`);
        }
        rows.push(`ROW ${rowNumber}: ${cells.join(" | ")}`);
      }
      parts.push({
        id: `sheet-${worksheet.id}-rows-${start}-${end}`,
        kind: "spreadsheet",
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.bytes.length,
        pageCount: null,
        content: `WORKSHEET ${JSON.stringify(worksheet.name)}\nMERGED RANGES: ${mergedRanges.join(", ") || "none"}\n${rows.join("\n")}`,
        metadata: { sheet: worksheet.name, rowStart: start, rowEnd: end, mergedRanges },
      });
    }
  }
  if (parts.length === 0) {
    throw new Error("The spreadsheet does not contain any worksheets.");
  }
  return parts;
}
