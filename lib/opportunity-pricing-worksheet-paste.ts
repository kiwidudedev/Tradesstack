import {
  type WorksheetCell,
  type WorksheetColumn,
  type WorksheetData,
  type WorksheetRow,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetCellFormat } from "@/lib/opportunity-pricing-worksheet-formatting";
import type { Json } from "@/lib/supabase/types";

export interface ParsedWorksheetPaste {
  rows: string[][];
  rowCount: number;
  columnCount: number;
  isTabular: boolean;
  formats?: Array<Array<WorksheetCellFormat | undefined>>;
  /** Formula text only when the clipboard representation exposes it explicitly. */
  formulas?: Array<Array<string | undefined>>;
}

export interface WorksheetClipboardPayload {
  version: 1;
  origin: { rowIndex: number; columnIndex: number };
  rows: Array<Array<{ input: string; format?: WorksheetCellFormat }>>;
}

export function getWorksheetPasteSelectionRange(
  anchor: { rowIndex: number; columnIndex: number },
  paste: Pick<ParsedWorksheetPaste, "rowCount" | "columnCount">,
) {
  return {
    startRowIndex: anchor.rowIndex,
    endRowIndex: anchor.rowIndex + Math.max(0, paste.rowCount - 1),
    startColumnIndex: anchor.columnIndex,
    endColumnIndex: anchor.columnIndex + Math.max(0, paste.columnCount - 1),
  };
}

export const WORKSHEET_CLIPBOARD_MIME = "application/x-tradesstack-worksheet";

function columnLabelFromIndex(index: number) {
  let current = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return label;
}

export function buildWorksheetCellKey(columnId: string, rowId: string) {
  return `${columnId}${rowId}`;
}

export function parseWorksheetCellKey(cellKey: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(cellKey);
  if (!match) {
    return null;
  }

  return {
    columnId: match[1],
    rowId: match[2],
  };
}

export function parseWorksheetClipboardText(input: string): ParsedWorksheetPaste | null {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");

  if (normalized.length === 0) {
    return null;
  }

  const isTabular = normalized.includes("\t") || normalized.includes("\n");

  const rows = normalized.split("\n").map((row) => row.split("\t"));
  const rowCount = rows.length;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  return {
    rows,
    rowCount,
    columnCount,
    isTabular,
  };
}

/**
 * Excel's plain-text clipboard often contains the displayed value rather than
 * the stored numeric value (for example "$20.00"). Use the accompanying HTML
 * number format to recover only unambiguous numeric values.
 */
export function normalizeExternalWorksheetClipboardInput(
  input: string,
  format: WorksheetCellFormat | undefined,
) {
  const kind = format?.number?.kind;
  if (!kind || kind === "general" || input.trim().startsWith("=")) return input;
  const trimmed = input.trim();
  const isPercent = kind === "percent";
  const cleaned = trimmed
    .replace(/[+$€£]/g, "")
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/%$/, "")
    .trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return input;
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return input;
  return String(isPercent ? numeric / 100 : numeric);
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/gi, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseCssDeclarations(style: string) {
  const declarations = new Map<string, string>();
  style.split(";").forEach((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator < 0) return;
    declarations.set(declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).trim());
  });
  return declarations;
}

function parseHtmlBorder(value: string | undefined): WorksheetCellFormat["border"] {
  if (!value || value.toLowerCase() === "none") return undefined;
  const style = value.match(/\b(solid|double|dashed|dotted)\b/i)?.[1];
  const color = value.match(/(#[0-9a-f]{3,8}|rgba?\([^)]*\)|\b(?!solid\b|double\b|dashed\b|dotted\b|\d+(?:\.\d+)?(?:px|pt|em|rem)\b)[a-z]+\b)/i)?.[1];
  if (!color && !style) return undefined;
  const border = { ...(color ? { color } : {}), style: "solid" as const };
  return { top: border, right: border, bottom: border, left: border };
}

function parseHtmlNumberFormat(value: string | undefined): WorksheetCellFormat["number"] | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^['"]|['"]$/g, "").toLowerCase();
  const decimalMatch = normalized.match(/\.([0#]+)/);
  const kind = normalized.includes("%")
    ? "percent"
    : normalized.includes("$") || normalized.includes("€") || normalized.includes("£")
      ? "currency"
      : /[0#]/.test(normalized) ? "number" : "general";
  if (kind === "general") return undefined;
  return {
    kind,
    ...(decimalMatch ? { decimalPlaces: decimalMatch[1].length } : {}),
    ...(normalized.includes(",") ? { useGrouping: true } : {}),
    ...(normalized.includes("(") && normalized.includes(")") ? { negativeStyle: "parentheses" as const } : {}),
    ...(kind === "currency" && normalized.includes("$") ? { currencyCode: "NZD" as const } : {}),
  };
}

function parseHtmlCellFormat(style: string, inheritedStyle = ""): WorksheetCellFormat | undefined {
  const declarations = parseCssDeclarations(`${inheritedStyle};${style}`);
  const format: WorksheetCellFormat = {};
  const weight = declarations.get("font-weight");
  const decoration = declarations.get("text-decoration") ?? "";
  const fontStyle = declarations.get("font-style");
  const color = declarations.get("color");
  const fill = declarations.get("background-color") ?? declarations.get("background");
  const align = declarations.get("text-align")?.toLowerCase();
  const fontSize = declarations.get("font-size")?.match(/[\d.]+/)?.[0];
  const wrap = declarations.get("white-space")?.toLowerCase();
  if (weight === "bold" || Number(weight) >= 600 || fontStyle === "italic" || decoration.includes("underline") || decoration.includes("line-through") || color || align || fontSize || wrap) {
    format.text = {
      ...(weight === "bold" || Number(weight) >= 600 ? { bold: true } : {}),
      ...(fontStyle === "italic" ? { italic: true } : {}),
      ...(decoration.includes("underline") ? { underline: true } : {}),
      ...(decoration.includes("line-through") ? { strikethrough: true } : {}),
      ...(color ? { color } : {}),
      ...(align === "left" || align === "center" || align === "right" ? { align } : {}),
      ...(fontSize ? { fontSize: Number(fontSize) } : {}),
      ...(wrap === "normal" || wrap === "pre-wrap" ? { wrap: "wrap" } : wrap === "nowrap" ? { wrap: "clip" } : {}),
    };
  }
  if (fill && fill !== "transparent") format.fill = { color: fill };
  const shorthandBorder = parseHtmlBorder(declarations.get("border"));
  if (shorthandBorder) format.border = shorthandBorder;
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const sideBorder = parseHtmlBorder(declarations.get(`border-${side}`));
    if (sideBorder?.top) format.border = { ...(format.border ?? {}), [side]: sideBorder.top };
  }
  const number = parseHtmlNumberFormat(declarations.get("mso-number-format") ?? declarations.get("data-number-format"));
  if (number) format.number = number;
  return Object.keys(format).length > 0 ? format : undefined;
}

function getHtmlAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1]
    ?? attributes.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"))?.[1];
}

function getExcelHtmlClassStyles(input: string) {
  const styles = new Map<string, string>();
  for (const match of input.matchAll(/\.([a-z0-9_-]+)\s*\{([^}]*)\}/gi)) {
    styles.set(match[1], match[2]);
  }
  const baseCellStyle = input.match(/\b(?:td|th)\s*\{([^}]*)\}/i)?.[1];
  if (baseCellStyle) styles.set("__excel_base_cell", baseCellStyle);
  return styles;
}

/** Parse the table/style subset emitted by Excel's HTML clipboard format. */
export function parseWorksheetClipboardHtml(input: string): ParsedWorksheetPaste | null {
  const table = input.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? input;
  const rowMatches = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) return null;
  const classStyles = getExcelHtmlClassStyles(input);
  const rows: string[][] = [];
  const formats: Array<Array<WorksheetCellFormat | undefined>> = [];
  const formulas: Array<Array<string | undefined>> = [];
  rowMatches.forEach((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
    rows.push(cells.map((cell) => {
      const formula = getHtmlAttribute(cell[2], "data-formula")
        ?? getHtmlAttribute(cell[2], "formula")
        ?? getHtmlAttribute(cell[2], "x:f")
        ?? cell[3].match(/<(?:f|formula)\b[^>]*>([\s\S]*?)<\/(?:f|formula)>/i)?.[1];
      return decodeHtml(formula ?? cell[3]);
    }));
    formats.push(cells.map((cell) => {
      const classStyle = ["__excel_base_cell", ...(getHtmlAttribute(cell[2], "class")?.split(/\s+/) ?? [])]
        .map((name) => classStyles.get(name))
        .filter(Boolean)
        .join(";");
      return parseHtmlCellFormat(getHtmlAttribute(cell[2], "style") ?? "", classStyle);
    }));
    formulas.push(cells.map((cell) => {
      const formula = getHtmlAttribute(cell[2], "data-formula")
        ?? getHtmlAttribute(cell[2], "formula")
        ?? getHtmlAttribute(cell[2], "x:f")
        ?? cell[3].match(/<(?:f|formula)\b[^>]*>([\s\S]*?)<\/(?:f|formula)>/i)?.[1];
      return formula ? decodeHtml(formula) : undefined;
    }));
  });
  return {
    rows,
    rowCount: rows.length,
    columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
    isTabular: true,
    formats,
    formulas,
  };
}

/**
 * Excel's plain-text clipboard is the reliable rectangular grid. Its HTML
 * clipboard is a formatting overlay and may omit empty cells or use a
 * different table shape. Keep the TSV dimensions and values authoritative,
 * while retaining HTML styles and any formula metadata exposed by the source.
 */
export function mergeExternalWorksheetClipboard(
  plainPaste: ParsedWorksheetPaste | null,
  htmlPaste: ParsedWorksheetPaste | null,
) {
  if (!plainPaste) return htmlPaste;
  if (!htmlPaste) return plainPaste;

  return {
    ...plainPaste,
    rows: plainPaste.rows.map((row, rowIndex) => row.map((plainValue, columnIndex) =>
      htmlPaste.formulas?.[rowIndex]?.[columnIndex] ?? plainValue
    )),
    formats: htmlPaste.formats,
    formulas: htmlPaste.formulas,
  } satisfies ParsedWorksheetPaste;
}

export function buildWorksheetClipboardPayload(
  worksheet: WorksheetData,
  range: { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number },
): WorksheetClipboardPayload {
  return {
    version: 1,
    origin: { rowIndex: range.startRowIndex, columnIndex: range.startColumnIndex },
    rows: Array.from({ length: range.endRowIndex - range.startRowIndex + 1 }, (_, rowOffset) =>
      Array.from({ length: range.endColumnIndex - range.startColumnIndex + 1 }, (_, columnOffset) => {
        const row = worksheet.rows[range.startRowIndex + rowOffset];
        const column = worksheet.columns[range.startColumnIndex + columnOffset];
        const cell = row && column ? worksheet.cells[buildWorksheetCellKey(column.id, row.id)] : undefined;
        return {
          input: cell?.formula ?? (cell?.value === null || cell?.value === undefined ? "" : String(cell.value)),
          ...(cell?.metadata.format && typeof cell.metadata.format === "object" ? { format: cell.metadata.format as WorksheetCellFormat } : {}),
        };
      }),
    ),
  };
}

export function serializeWorksheetClipboardPayload(payload: WorksheetClipboardPayload) {
  return JSON.stringify(payload);
}

export function parseWorksheetClipboardPayload(input: string): WorksheetClipboardPayload | null {
  try {
    const payload = JSON.parse(input) as Partial<WorksheetClipboardPayload>;
    if (payload.version !== 1 || !payload.origin || !Array.isArray(payload.rows) || payload.rows.length === 0) return null;
    if (!Number.isInteger(payload.origin.rowIndex) || !Number.isInteger(payload.origin.columnIndex)) return null;
    if (!payload.rows.every((row) => Array.isArray(row) && row.every((cell) => cell && typeof cell.input === "string"))) return null;
    return payload as WorksheetClipboardPayload;
  } catch {
    return null;
  }
}

export function getWorksheetAnchorPosition(worksheet: WorksheetData, cellKey: string) {
  const parsed = parseWorksheetCellKey(cellKey);
  if (!parsed) {
    return null;
  }

  const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
  const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);

  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }

  return {
    columnIndex,
    rowIndex,
  };
}

export function expandWorksheetToFitPaste(
  worksheet: WorksheetData,
  anchor: { columnIndex: number; rowIndex: number },
  paste: ParsedWorksheetPaste
) {
  const requiredColumnCount = Math.max(
    worksheet.columnCount,
    anchor.columnIndex + paste.columnCount
  );
  const requiredRowCount = Math.max(
    worksheet.rowCount,
    anchor.rowIndex + paste.rowCount
  );

  const columns: WorksheetColumn[] =
    requiredColumnCount === worksheet.columnCount
      ? worksheet.columns
      : Array.from({ length: requiredColumnCount }, (_, index) => {
          const existing = worksheet.columns[index];
          return (
            existing ?? {
              id: columnLabelFromIndex(index),
              index,
              label: columnLabelFromIndex(index),
              width: 140,
            }
          );
        });

  const rows: WorksheetRow[] =
    requiredRowCount === worksheet.rowCount
      ? worksheet.rows
      : Array.from({ length: requiredRowCount }, (_, index) => {
          const existing = worksheet.rows[index];
          return (
            existing ?? {
              id: String(index + 1),
              index,
              height: 36,
            }
          );
        });

  return {
    ...worksheet,
    columnCount: requiredColumnCount,
    rowCount: requiredRowCount,
    columns,
    rows,
  };
}

export function applyWorksheetPasteToCells(
  worksheet: WorksheetData,
  anchor: { columnIndex: number; rowIndex: number },
  paste: ParsedWorksheetPaste,
  normalizeCell: (input: string) => WorksheetCell
) {
  const nextCells = { ...worksheet.cells };

  paste.rows.forEach((rowValues, rowOffset) => {
    rowValues.forEach((rawValue, columnOffset) => {
      const column = worksheet.columns[anchor.columnIndex + columnOffset];
      const row = worksheet.rows[anchor.rowIndex + rowOffset];

      if (!column || !row) {
        return;
      }

      const cellKey = buildWorksheetCellKey(column.id, row.id);
      const normalizedCell = normalizeCell(rawValue);

      if (normalizedCell.type === "empty") {
        delete nextCells[cellKey];
      } else {
        nextCells[cellKey] = normalizedCell;
      }
    });
  });

  return {
    ...worksheet,
    cells: nextCells,
  };
}

export function applyWorksheetClipboardPayloadToCells(
  worksheet: WorksheetData,
  anchor: { columnIndex: number; rowIndex: number },
  payload: WorksheetClipboardPayload,
  normalizeCell: (input: string) => WorksheetCell,
  transformInput: (input: string, rowDelta: number, columnDelta: number) => string = (input) => input,
) {
  const nextCells = { ...worksheet.cells };
  payload.rows.forEach((rowValues, rowOffset) => rowValues.forEach((sourceCell, columnOffset) => {
    const targetColumn = worksheet.columns[anchor.columnIndex + columnOffset];
    const targetRow = worksheet.rows[anchor.rowIndex + rowOffset];
    if (!targetColumn || !targetRow) return;
    const rowDelta = anchor.rowIndex - payload.origin.rowIndex;
    const columnDelta = anchor.columnIndex - payload.origin.columnIndex;
    const normalizedCell = normalizeCell(transformInput(sourceCell.input, rowDelta, columnDelta));
    const cellKey = buildWorksheetCellKey(targetColumn.id, targetRow.id);
    if (normalizedCell.type === "empty") {
      delete nextCells[cellKey];
      return;
    }
    nextCells[cellKey] = sourceCell.format
      ? { ...normalizedCell, metadata: { ...normalizedCell.metadata, format: sourceCell.format as unknown as Json } }
      : normalizedCell;
  }));
  return { ...worksheet, cells: nextCells };
}
