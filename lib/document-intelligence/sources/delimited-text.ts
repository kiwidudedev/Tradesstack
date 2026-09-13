import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";

export function parseCsvMatrix(text: string): string[][] {
  if (text.length > 4_000_000) throw new Error("CSV content exceeds processing limits.");
  const rows: string[][] = [];
  let cellCount = 0;
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (rows.length >= 20000 || row.length >= 256 || cellCount >= 500000) throw new Error("CSV dimensions exceed processing limits.");
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cellCount += 1; cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cellCount += 1; rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); cellCount += 1; rows.push(row); }
  return rows;
}

export function createCsvSourceParts(input: {
  fileName: string;
  bytes: Uint8Array;
  rowsPerChunk?: number;
}): DocumentSourcePart[] {
  const rows = parseCsvMatrix(Buffer.from(input.bytes).toString("utf8"));
  const size = Number.isFinite(input.rowsPerChunk) ? Math.min(500, Math.max(100, Math.floor(input.rowsPerChunk ?? 250))) : 250;
  const parts: DocumentSourcePart[] = [];
  for (let startIndex = 0; startIndex < rows.length; startIndex += size) {
    const slice = rows.slice(startIndex, startIndex + size);
    const start = startIndex + 1;
    const end = startIndex + slice.length;
    const content = slice.map((cells, offset) =>
      `ROW ${start + offset}: ${cells.map((value, column) => `${columnName(column + 1)}=${JSON.stringify(value)}`).join(" | ")}`
    ).join("\n");
    parts.push({
      id: `csv-rows-${start}-${end}`,
      kind: "csv",
      fileName: input.fileName,
      mimeType: "text/csv",
      sizeBytes: input.bytes.length,
      pageCount: null,
      content,
      metadata: { rowStart: start, rowEnd: end },
    });
  }
  return parts;
}

function columnName(column: number) {
  let value = column;
  let result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}
