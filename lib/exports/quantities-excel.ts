import type { QuantityTableGroup } from "@/components/app/TakeoffQuantitiesTable";
import type { QuantityTableRow } from "@/lib/takeoff/quantities-adapter";
import type { Workbook, Worksheet } from "exceljs";

export interface QuantitiesExcelExportContext {
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationBrandPrimaryColor: string | null;
  projectName: string;
  drawingSetName: string | null;
  drawingScope?: "current" | "all";
  exportDateIso: string;
  pageFilterLabel?: string | null;
}

export interface ExportQuantitiesWorkbookParams {
  rows: QuantityTableRow[];
  groups?: QuantityTableGroup[] | null;
  context: QuantitiesExcelExportContext;
}

function sanitizeHexColor(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(trimmed) ? trimmed.toUpperCase() : "#0B2739";
}

function colorHexToArgb(value: string) {
  const normalized = value.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized
        .split("")
        .map((segment) => `${segment}${segment}`)
        .join("")
    : normalized;

  return `FF${expanded.toUpperCase()}`;
}

function formatQuantityNumber(value: number | null) {
  return value ?? null;
}

function formatGroupLabel(group: QuantityTableGroup) {
  return group.totalsLabel ? `${group.label} - ${group.totalsLabel}` : group.label;
}

export function buildQuantitiesExportRowValues(row: QuantityTableRow, groupLabel?: string | null, includeDrawing = false) {
  const values: Array<string | number | null> = [
    groupLabel ?? "",
  ];
  if (includeDrawing) values.push(row.drawingDisplayName);
  values.push(
    row.name,
    row.description ?? "",
    formatQuantityNumber(row.quantityValue),
    row.unitLabel,
    formatQuantityNumber(row.secondaryQuantityValue),
    row.secondaryUnitLabel ?? "",
    row.pageLabel,
    "",
  );
  return values;
}

function toFileSafeSegment(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function addLogoImage(params: {
  workbook: Pick<Workbook, "addImage">;
  worksheet: Pick<Worksheet, "addImage">;
  logoUrl: string | null;
}) {
  if (!params.logoUrl) {
    return;
  }

  try {
    const response = await fetch(params.logoUrl);
    if (!response.ok) {
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const extension = contentType.includes("png") ? "png" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpeg" : null;
    if (!extension) {
      return;
    }

    const bytes = await response.arrayBuffer();
    const imageId = params.workbook.addImage({
      // ExcelJS accepts Uint8Array in browsers, while its declaration still
      // narrows this field to Node's Buffer type.
      buffer: new Uint8Array(bytes) as never,
      extension,
    });

    params.worksheet.addImage(imageId, "A1:B4");
  } catch {
    // Ignore logo download failures so export can continue with text-only branding.
  }
}

export function buildQuantitiesExportFilename(params: {
  projectName: string;
  exportDateIso: string;
}) {
  const projectSegment = toFileSafeSegment(params.projectName) || "Project";
  return `${projectSegment} - Quantities - ${params.exportDateIso}.xlsx`;
}

export async function exportQuantitiesWorkbook(params: ExportQuantitiesWorkbookParams) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Quantities Export");
  const brandPrimaryColor = sanitizeHexColor(params.context.organizationBrandPrimaryColor);
  const brandPrimaryArgb = colorHexToArgb(brandPrimaryColor);
  const borderColorArgb = "FFCFCFD6";
  const mutedFillArgb = "FFF8FAFB";
  const sectionFillArgb = "FFEEF3F8";
  const tableHeaderRow = 7;
  const includeDrawing = params.context.drawingScope === "all";
  const tableColumns = [
    { header: "Group", key: "group", width: 24 },
    ...(includeDrawing ? [{ header: "Drawing", key: "drawing", width: 26 }] : []),
    { header: "Measurement / Item", key: "measurement", width: 30 },
    { header: "Description", key: "description", width: 34 },
    { header: "Primary Qty", key: "primaryQty", width: 14 },
    { header: "Primary Unit", key: "primaryUnit", width: 14 },
    { header: "Secondary Qty", key: "secondaryQty", width: 14 },
    { header: "Secondary Unit", key: "secondaryUnit", width: 15 },
    { header: "Drawing/Page", key: "page", width: 22 },
    { header: "Notes", key: "notes", width: 26 },
  ];
  const lastColumnLetter = includeDrawing ? "J" : "I";

  workbook.creator = "Tradesstack";
  workbook.created = new Date();
  workbook.modified = new Date();

  worksheet.properties.defaultRowHeight = 22;
  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
  };
  worksheet.views = [{ state: "frozen", ySplit: tableHeaderRow }];
  worksheet.columns = tableColumns.map((column) => ({
    key: column.key,
    width: column.width,
  }));

  await addLogoImage({
    workbook,
    worksheet,
    logoUrl: params.context.organizationLogoUrl,
  });

  worksheet.mergeCells(`C1:${lastColumnLetter}1`);
  worksheet.getCell("C1").value = params.context.organizationName.trim() || "Tradesstack";
  worksheet.getCell("C1").font = { name: "Inter", size: 16, bold: true, color: { argb: brandPrimaryArgb } };
  worksheet.getCell("C1").alignment = { vertical: "middle", horizontal: "left" };

  worksheet.mergeCells(`C2:${lastColumnLetter}2`);
  worksheet.getCell("C2").value = params.context.projectName.trim() || "Project";
  worksheet.getCell("C2").font = { name: "Inter", size: 14, bold: true, color: { argb: "FF1F2937" } };

  worksheet.mergeCells("C3:G3");
  worksheet.getCell("C3").value = "Quantities Export";
  worksheet.getCell("C3").font = { name: "Inter", size: 12, bold: true, color: { argb: "FF1F2937" } };

  worksheet.mergeCells("H3:I3");
  worksheet.getCell("H3").value = `Export Date: ${params.context.exportDateIso}`;
  worksheet.getCell("H3").font = { name: "Inter", size: 11, color: { argb: "FF4B5563" } };
  worksheet.getCell("H3").alignment = { horizontal: "right" };

  worksheet.mergeCells(`C4:${lastColumnLetter}4`);
  worksheet.getCell("C4").value = [
    includeDrawing ? "Drawing Set: All drawings" : params.context.drawingSetName ? `Drawing Set: ${params.context.drawingSetName}` : "",
    params.context.pageFilterLabel ? `View: ${params.context.pageFilterLabel}` : "",
  ]
    .filter(Boolean)
    .join("   |   ");
  worksheet.getCell("C4").font = { name: "Inter", size: 10, color: { argb: "FF6B7280" } };

  for (let columnIndex = 1; columnIndex <= tableColumns.length; columnIndex += 1) {
    const cell = worksheet.getRow(6).getCell(columnIndex);
    cell.border = {
      top: { style: "thin", color: { argb: borderColorArgb } },
    };
  }

  const headerRow = worksheet.getRow(tableHeaderRow);
  tableColumns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Inter", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: brandPrimaryArgb },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: borderColorArgb } },
      bottom: { style: "thin", color: { argb: borderColorArgb } },
      left: { style: "thin", color: { argb: borderColorArgb } },
      right: { style: "thin", color: { argb: borderColorArgb } },
    };
  });
  headerRow.height = 24;
  worksheet.autoFilter = {
    from: { row: tableHeaderRow, column: 1 },
    to: { row: tableHeaderRow, column: tableColumns.length },
  };

  const rowsById = new Map(params.rows.map((row) => [row.id, row]));
  let currentRowNumber = tableHeaderRow + 1;

  const appendDataRow = (row: QuantityTableRow, groupLabel?: string | null) => {
    const worksheetRow = worksheet.getRow(currentRowNumber);
    buildQuantitiesExportRowValues(row, groupLabel, includeDrawing).forEach((value, index) => {
      worksheetRow.getCell(index + 1).value = value;
    });

    worksheetRow.eachCell((cell, columnNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: borderColorArgb } },
        bottom: { style: "thin", color: { argb: borderColorArgb } },
        left: { style: "thin", color: { argb: borderColorArgb } },
        right: { style: "thin", color: { argb: borderColorArgb } },
      };
      cell.alignment = {
        vertical: "top",
        wrapText: includeDrawing
          ? [1, 2, 3, 4, 9, 10].includes(columnNumber)
          : [1, 2, 3, 8, 9].includes(columnNumber),
        horizontal: columnNumber === (includeDrawing ? 5 : 4) || columnNumber === (includeDrawing ? 7 : 6) ? "right" : "left",
      };
      cell.font = { name: "Inter", size: 10, color: { argb: "FF1F2937" } };
      if (row.status === "archived") {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: mutedFillArgb },
        };
      }
    });

    worksheetRow.getCell(includeDrawing ? 5 : 4).numFmt = '#,##0.00';
    worksheetRow.getCell(includeDrawing ? 7 : 6).numFmt = '#,##0.00';
    currentRowNumber += 1;
  };

  if (params.groups && params.groups.length > 0) {
    params.groups.forEach((group) => {
      const groupHeaderRow = worksheet.getRow(currentRowNumber);
      groupHeaderRow.getCell(1).value = formatGroupLabel(group);
      worksheet.mergeCells(`A${currentRowNumber}:${lastColumnLetter}${currentRowNumber}`);
      const firstCell = groupHeaderRow.getCell(1);
      firstCell.font = { name: "Inter", size: 10, bold: true, color: { argb: "FF10283B" } };
      firstCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: sectionFillArgb },
      };
      firstCell.border = {
        top: { style: "thin", color: { argb: borderColorArgb } },
        bottom: { style: "thin", color: { argb: borderColorArgb } },
        left: { style: "thin", color: { argb: borderColorArgb } },
        right: { style: "thin", color: { argb: borderColorArgb } },
      };
      firstCell.alignment = { vertical: "middle", horizontal: "left" };
      currentRowNumber += 1;

      group.rows.forEach((row) => {
        const rowFromSource = rowsById.get(row.id) ?? row;
        appendDataRow(rowFromSource, group.label);
      });
    });
  } else {
    params.rows.forEach((row) => {
      appendDataRow(row, null);
    });
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) {
      return;
    }
    row.height = rowNumber === tableHeaderRow ? 24 : 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildQuantitiesExportFilename({
    projectName: params.context.projectName,
    exportDateIso: params.context.exportDateIso,
  });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
