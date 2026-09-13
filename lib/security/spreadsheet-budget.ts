import { inflateRawSync } from "node:zlib";

const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;

/** Bound actual ZIP expansion before ExcelJS builds its in-memory XML/workbook model. */
export function assertSpreadsheetArchiveBudget(bytes: Uint8Array, maximumExpandedBytes = MAX_EXPANDED_BYTES): void {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = () => { throw new Error("Spreadsheet archive is invalid or exceeds processing limits."); };
  if (zip.length > MAX_COMPRESSED_BYTES || zip.length < 22) fail();
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) { end = i; break; }
  }
  if (end < 0) return fail();
  const entries = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const centralEnd = cursor + zip.readUInt32LE(end + 12);
  if (entries > 2048 || centralEnd > end || zip.readUInt32LE(end + 4) !== 0 || zip.readUInt16LE(end + 8) !== entries) fail();
  let expanded = 0;
  for (let i = 0; i < entries; i += 1) {
    if (cursor + 46 > centralEnd || zip.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const expandedSize = zip.readUInt32LE(cursor + 24);
    const offset = zip.readUInt32LE(cursor + 42);
    if ((flags & 1) || ![0, 8].includes(method) || expanded + expandedSize > maximumExpandedBytes || offset + 30 > zip.length) fail();
    if (zip.readUInt32LE(offset) !== 0x04034b50 || zip.readUInt16LE(offset + 8) !== method) fail();
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    if (start + compressedSize > zip.length) fail();
    const compressed = zip.subarray(start, start + compressedSize);
    let actualSize: number;
    try {
      actualSize = method === 0 ? compressed.byteLength : inflateRawSync(compressed, { maxOutputLength: Math.max(1, maximumExpandedBytes - expanded) }).byteLength;
    } catch { return fail(); }
    if (actualSize !== expandedSize || expanded + actualSize > maximumExpandedBytes) fail();
    expanded += actualSize;
    cursor += 46 + zip.readUInt16LE(cursor + 28) + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  }
  if (cursor !== centralEnd) fail();
}

export function assertWorksheetBudget(sheets: Array<{ rowCount: number; columnCount: number }>): void {
  let cells = 0;
  if (sheets.length > 50) throw new Error("Spreadsheet has too many worksheets.");
  for (const sheet of sheets) {
    cells += sheet.rowCount * sheet.columnCount;
    if (sheet.rowCount > 20000 || sheet.columnCount > 256 || cells > 500000) {
      throw new Error("Spreadsheet dimensions exceed processing limits.");
    }
  }
}
