import ExcelJS from "exceljs";
import type { MaterialImportCandidateRow, MaterialImportExtractionResult } from "@/lib/materials/types";

export const MATERIAL_IMPORTS_BUCKET = "material-library-imports";
export const MAX_MATERIAL_IMPORT_SIZE_BYTES = 25 * 1024 * 1024;
export const MATERIAL_IMPORT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const UNIT_TOKENS = new Set([
  "m",
  "lm",
  "m2",
  "m3",
  "ea",
  "each",
  "pcs",
  "pc",
  "sheet",
  "bag",
  "box",
  "kg",
  "tonne",
  "roll",
  "pack",
  "pair",
  "set",
]);

let pdfWorkerBootstrapPromise: Promise<void> | null = null;

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown;
  };
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isCandidateRow(
  value: MaterialImportCandidateRow | null
): value is MaterialImportCandidateRow {
  return value !== null;
}

function parseNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDelimitedLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function detectHeaderIndex(rows: string[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 5).forEach((row, rowIndex) => {
    const joined = row.join(" ").toLowerCase();
    let score = 0;
    if (joined.includes("material") || joined.includes("item") || joined.includes("description")) {
      score += 3;
    }
    if (joined.includes("unit")) {
      score += 2;
    }
    if (joined.includes("price") || joined.includes("cost") || joined.includes("rate")) {
      score += 3;
    }
    if (joined.includes("sku")) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  });

  return bestIndex;
}

function indexColumns(headers: string[]) {
  const lowerHeaders = headers.map((header) => normalizeWhitespace(header).toLowerCase());
  return {
    name:
      lowerHeaders.findIndex((header) => /material|item|product|description|name/.test(header)) ?? -1,
    unit: lowerHeaders.findIndex((header) => /unit|uom/.test(header)),
    cost: lowerHeaders.findIndex((header) => /cost|price|rate/.test(header)),
    supplierDescription: lowerHeaders.findIndex((header) => /supplier.*description|supplier.*name/.test(header)),
    sku: lowerHeaders.findIndex((header) => /sku|code/.test(header)),
    currency: lowerHeaders.findIndex((header) => /currency/.test(header)),
  };
}

function buildCandidateRowFromCells(params: {
  rowIndex: number;
  cells: string[];
  headerMap: ReturnType<typeof indexColumns>;
}): MaterialImportCandidateRow | null {
  const { cells, rowIndex, headerMap } = params;
  const nameValue = headerMap.name >= 0 ? cells[headerMap.name] ?? "" : cells[0] ?? "";
  const costValue =
    headerMap.cost >= 0
      ? cells[headerMap.cost] ?? ""
      : cells.find((cell) => parseNumber(cell) !== null) ?? "";

  const extractedUnitCost = parseNumber(costValue);
  if (!nameValue.trim() || extractedUnitCost === null) {
    return null;
  }

  const extractedUnit =
    headerMap.unit >= 0
      ? normalizeWhitespace(cells[headerMap.unit] ?? "")
      : normalizeWhitespace(
          cells.find((cell) => UNIT_TOKENS.has(cell.trim().toLowerCase())) ?? ""
        ) || null;

  const extractedDescription = cells
    .filter((cell, index) => ![headerMap.name, headerMap.unit, headerMap.cost].includes(index))
    .join(" ")
    .trim();

  return {
    rowIndex,
    extractedName: normalizeWhitespace(nameValue),
    extractedDescription: extractedDescription || null,
    extractedUnit: extractedUnit || null,
    extractedUnitCost,
    extractedCurrency:
      headerMap.currency >= 0 ? normalizeWhitespace(cells[headerMap.currency] ?? "").toUpperCase() || null : null,
    supplierDescription:
      headerMap.supplierDescription >= 0
        ? normalizeWhitespace(cells[headerMap.supplierDescription] ?? "") || null
        : null,
    supplierSku: headerMap.sku >= 0 ? normalizeWhitespace(cells[headerMap.sku] ?? "") || null : null,
    confidence: 0.74,
    sourcePayload: {
      cells,
    },
  } satisfies MaterialImportCandidateRow;
}

function dedupeCandidateRows(rows: MaterialImportCandidateRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.extractedName.toLowerCase(),
      row.extractedUnit?.toLowerCase() ?? "",
      row.extractedUnitCost?.toFixed(4) ?? "",
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractRowsFromMatrix(matrix: string[][], sourceLabel: string): MaterialImportExtractionResult {
  const trimmedRows = matrix
    .map((row) => row.map((cell) => normalizeWhitespace(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (trimmedRows.length === 0) {
    return {
      extractionMethod: sourceLabel === "csv" ? "csv" : "spreadsheet",
      rows: [],
      summary: { message: "No data rows were found in the uploaded file." },
    };
  }

  const headerIndex = detectHeaderIndex(trimmedRows);
  const headerMap = indexColumns(trimmedRows[headerIndex] ?? []);
  const bodyRows = trimmedRows.slice(headerIndex + 1);

  const extracted = bodyRows
    .map((cells, index) =>
      buildCandidateRowFromCells({
        rowIndex: index + 1,
        cells,
        headerMap,
      })
    )
    .filter(isCandidateRow);

  return {
    extractionMethod: sourceLabel === "csv" ? "csv" : "spreadsheet",
    rows: dedupeCandidateRows(extracted),
    summary: {
      message:
        extracted.length > 0
          ? `Parsed ${extracted.length} candidate rows for review.`
          : "No obvious material rows were detected. You can still add rows manually.",
      sheetName: sourceLabel === "spreadsheet" ? trimmedRows[headerIndex]?.[0] ?? null : null,
      lineCount: bodyRows.length,
    },
  };
}

function extractRowsFromCsvText(text: string): MaterialImportExtractionResult {
  const matrix = text
    .split(/\r?\n/)
    .map((line) => parseDelimitedLine(line));
  return extractRowsFromMatrix(matrix, "csv");
}

async function extractRowsFromSpreadsheet(buffer: ArrayBuffer): Promise<MaterialImportExtractionResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer) as never);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return {
      extractionMethod: "spreadsheet",
      rows: [],
      summary: { message: "No worksheet was found in the uploaded workbook." },
    };
  }

  const matrix: string[][] = [];
  worksheet.eachRow((row) => {
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = rawValues.map((value: unknown) => {
        if (value === null || value === undefined) {
          return "";
        }
        if (typeof value === "object" && "text" in value && typeof value.text === "string") {
          return value.text;
        }
        return String(value);
        });
    matrix.push(cells);
  });

  const result = extractRowsFromMatrix(matrix, "spreadsheet");
  return {
    ...result,
    summary: {
      ...result.summary,
      sheetName: worksheet.name,
    },
  };
}

async function ensurePdfJsWorkerBootstrap(): Promise<void> {
  const globalRef = globalThis as PdfJsWorkerGlobal;
  if (globalRef.pdfjsWorker?.WorkerMessageHandler) {
    return;
  }

  if (!pdfWorkerBootstrapPromise) {
    pdfWorkerBootstrapPromise = (async () => {
      const pdfWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      const workerMessageHandler = (pdfWorker as { WorkerMessageHandler?: unknown }).WorkerMessageHandler;
      if (!workerMessageHandler) {
        throw new Error("pdf.js WorkerMessageHandler is unavailable.");
      }

      globalRef.pdfjsWorker = {
        ...(globalRef.pdfjsWorker ?? {}),
        WorkerMessageHandler: workerMessageHandler,
      };
    })().catch((error) => {
      pdfWorkerBootstrapPromise = null;
      throw error;
    });
  }

  await pdfWorkerBootstrapPromise;
}

function buildCandidateRowFromPdfLine(line: string, rowIndex: number): MaterialImportCandidateRow | null {
  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return null;
  }

  const costMatch = normalized.match(/(?:NZD|AUD|\$)?\s*([0-9]+(?:[.,][0-9]{1,4})?)/g);
  if (!costMatch || costMatch.length === 0) {
    return null;
  }

  const lastMatch = costMatch[costMatch.length - 1] ?? null;
  const extractedUnitCost = parseNumber(lastMatch);
  if (extractedUnitCost === null) {
    return null;
  }

  const tokens = normalized.split(" ");
  const unitToken = tokens.find((token) => UNIT_TOKENS.has(token.toLowerCase())) ?? null;
  const name = normalizeWhitespace(normalized.replace(lastMatch ?? "", "").replace(/\b(?:NZD|AUD|\$)\b/g, ""));

  if (name.length < 3) {
    return null;
  }

  return {
    rowIndex,
    extractedName: name,
    extractedDescription: null,
    extractedUnit: unitToken,
    extractedUnitCost,
    extractedCurrency: normalized.includes("AUD") ? "AUD" : "NZD",
    supplierDescription: null,
    supplierSku: null,
    confidence: 0.45,
    sourcePayload: {
      line,
    },
  } satisfies MaterialImportCandidateRow;
}

async function extractRowsFromPdf(buffer: ArrayBuffer): Promise<MaterialImportExtractionResult> {
  await ensurePdfJsWorkerBootstrap();
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (params: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
        cleanup?: () => void;
        destroy?: () => void;
      }>;
      destroy?: () => Promise<void>;
    };
  };

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  let pdf:
    | {
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
        cleanup?: () => void;
        destroy?: () => void;
      }
    | null = null;

  try {
    pdf = await loadingTask.promise;
    const lines: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = normalizeWhitespace(
        content.items.map((item) => (typeof item.str === "string" ? item.str : "")).join(" ")
      );
      if (line) {
        lines.push(...line.split(/(?<=\d)\s{2,}|\s(?=[A-Z0-9][^ ]+\s(?:NZD|AUD|\$))/g));
      }
    }

    const rows = dedupeCandidateRows(
      lines
        .map((line, index) => buildCandidateRowFromPdfLine(line, index + 1))
        .filter(isCandidateRow)
    );

    return {
      extractionMethod: "pdf_text",
      rows,
      summary: {
        message:
          rows.length > 0
            ? `Extracted ${rows.length} candidate rows from PDF text.`
            : "No reliable PDF line items were detected. You can still add rows manually.",
        lineCount: lines.length,
      },
    };
  } finally {
    if (loadingTask.destroy) {
      await loadingTask.destroy().catch(() => undefined);
    }
    pdf?.cleanup?.();
    if (pdf?.destroy) {
      pdf.destroy();
    }
  }
}

export async function extractMaterialImportRows(params: {
  fileName: string;
  mimeType: string;
  buffer: ArrayBuffer;
}): Promise<MaterialImportExtractionResult> {
  const lowerFileName = params.fileName.toLowerCase();
  const mimeType = params.mimeType.toLowerCase();

  if (lowerFileName.endsWith(".csv") || mimeType === "text/csv" || mimeType === "application/csv") {
    return extractRowsFromCsvText(Buffer.from(params.buffer).toString("utf8"));
  }

  if (
    lowerFileName.endsWith(".xlsx") ||
    lowerFileName.endsWith(".xlsm") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return extractRowsFromSpreadsheet(params.buffer);
  }

  if (lowerFileName.endsWith(".pdf") || mimeType === "application/pdf") {
    return extractRowsFromPdf(params.buffer);
  }

  if (mimeType.startsWith("image/")) {
    return {
      extractionMethod: "image_manual_review",
      rows: [],
      summary: {
        message: "Image uploads are staged for manual review. Add rows in the review table after upload.",
      },
    };
  }

  return {
    extractionMethod: "unsupported",
    rows: [],
    summary: {
      message: "This file type was uploaded, but automatic extraction is not available yet.",
    },
  };
}
