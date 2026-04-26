import {
  PDFDocument,
  rgb,
} from "pdf-lib";
import type {
  ExportTakeoffAreaShape,
  ExportTakeoffCalibration,
  ExportTakeoffLegendRow,
  ExportTakeoffLinePath,
  ExportTakeoffMeasurement,
  ExportTakeoffPageInput,
  ExportTakeoffPoint,
} from "@/lib/exports/takeoff-pdf-export-types";

type Point2D = {
  x: number;
  y: number;
};

type PdfJsPageProxy = {
  getViewport: (params: { scale: number; rotation?: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    background?: string;
  }) => { promise: Promise<void> };
};

type PdfJsDocumentProxy = {
  getPage: (pageNumber: number) => Promise<PdfJsPageProxy>;
  numPages: number;
  destroy?: () => Promise<void> | void;
};

type PdfJsLoadingTask = {
  promise: Promise<PdfJsDocumentProxy>;
  destroy?: () => Promise<void> | void;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { url: string; withCredentials?: boolean }) => PdfJsLoadingTask;
};

const DEFAULT_DISTANCE_COLOR = "#F15A29";
const DEFAULT_AREA_COLOR = "#0F766E";
const DEFAULT_COUNT_COLOR = "#2563EB";
const CALIBRATION_STROKE_COLOR = "#14B8A6";
const CALIBRATION_FILL_COLOR = "#0F766E";
const LABEL_TEXT_COLOR = "#334155";
const LABEL_FILL_COLOR = "rgba(255,255,255,0.96)";
const LABEL_BORDER_COLOR = "rgba(226,232,240,0.95)";
const LABEL_FONT_SIZE = 11;
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 5;
const AREA_FILL_ALPHA = 0.12;
const AREA_STROKE_WIDTH = 2.75;
const LINE_STROKE_WIDTH = 2.75;
const COUNT_RADIUS = 8;
const CALIBRATION_RADIUS = 7;

function sanitizeFilePart(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || fallback;
}

export function buildTakeoffPdfExportFileName(params: {
  projectName: string;
  pageName: string;
  date?: Date;
}) {
  const exportDate = params.date ?? new Date();
  const year = exportDate.getFullYear();
  const month = String(exportDate.getMonth() + 1).padStart(2, "0");
  const day = String(exportDate.getDate()).padStart(2, "0");
  const dateIso = `${year}-${month}-${day}`;

  return `${sanitizeFilePart(params.projectName, "Project")} - Marked Up Takeoff - ${sanitizeFilePart(params.pageName, "Page")} - ${dateIso}.pdf`;
}

async function loadPdfJsModule(): Promise<PdfJsModule> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  return pdfjs;
}

function clampNormalizedPoint(point: ExportTakeoffPoint): ExportTakeoffPoint {
  return {
    x: Math.min(Math.max(point.x, 0), 1),
    y: Math.min(Math.max(point.y, 0), 1),
  };
}

function normalizedToCanvasPoint(point: ExportTakeoffPoint, canvasWidth: number, canvasHeight: number): Point2D {
  const normalized = clampNormalizedPoint(point);
  return {
    x: normalized.x * canvasWidth,
    y: normalized.y * canvasHeight,
  };
}

function getMeasurementColor(measurement: ExportTakeoffMeasurement) {
  const normalized = measurement.colorHex.trim();
  if (normalized) {
    return normalized;
  }

  if (measurement.kind === "area") {
    return DEFAULT_AREA_COLOR;
  }

  if (measurement.kind === "count") {
    return DEFAULT_COUNT_COLOR;
  }

  return DEFAULT_DISTANCE_COLOR;
}

function hexToRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) {
    return hexColor;
  }

  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgba(${red},${green},${blue},${alpha})`;
}

function hexToPdfColor(hexColor: string) {
  const normalized = hexColor.trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) {
    return rgb(0.129, 0.212, 0.333);
  }

  const hex = match[1];
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  );
}

function getExportAreaShapes(measurement: ExportTakeoffMeasurement): ExportTakeoffAreaShape[] {
  if (measurement.areaShapes.length > 0) {
    return measurement.areaShapes.map((shape) => ({
      ...shape,
      role: shape.role === "deduction" ? "deduction" : "include",
    }));
  }

  if (measurement.kind === "area" && measurement.points.length >= 3) {
    return [{ id: `${measurement.id}:shape-0`, role: "include", points: measurement.points }];
  }

  return [];
}

function getExportLinePaths(measurement: ExportTakeoffMeasurement): ExportTakeoffLinePath[] {
  if (measurement.linePaths.length > 0) {
    return measurement.linePaths;
  }

  if (measurement.kind === "line" && measurement.points.length >= 2) {
    return [{ id: `${measurement.id}:path-0`, points: measurement.points }];
  }

  return [];
}

function getMeasurementLabelText(measurement: ExportTakeoffMeasurement) {
  const trimmedName = measurement.name.trim();
  return trimmedName ? `${trimmedName} • ${measurement.label}` : measurement.label;
}

function getPolylineLength(points: Point2D[]) {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }

  return length;
}

function getPointAlongPolyline(points: Point2D[], distance: number): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  const totalLength = getPolylineLength(points);
  const targetDistance = Math.min(Math.max(distance, 0), totalLength);
  let traversedDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);

    if (segmentLength <= 0) {
      continue;
    }

    if (traversedDistance + segmentLength >= targetDistance) {
      const ratio = (targetDistance - traversedDistance) / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }

    traversedDistance += segmentLength;
  }

  return points[points.length - 1];
}

function getPolylineLabelAnchor(points: Point2D[], offsetDistance: number): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  const midpointDistance = getPolylineLength(points) / 2;
  let traversedDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);

    if (segmentLength <= 0) {
      continue;
    }

    if (traversedDistance + segmentLength >= midpointDistance) {
      const anchor =
        getPointAlongPolyline(points, midpointDistance) ?? {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        };
      const normalX = -((end.y - start.y) / segmentLength);
      const normalY = (end.x - start.x) / segmentLength;

      return {
        x: anchor.x + normalX * offsetDistance,
        y: anchor.y + normalY * offsetDistance,
      };
    }

    traversedDistance += segmentLength;
  }

  return points[points.length - 1];
}

function getPolygonArea(points: Point2D[]) {
  if (points.length < 3) {
    return 0;
  }

  let areaAccumulator = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    areaAccumulator += current.x * next.y - next.x * current.y;
  }

  return Math.abs(areaAccumulator) / 2;
}

function getPolygonCentroid(points: Point2D[]): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  if (points.length < 3) {
    const totals = points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y,
      }),
      { x: 0, y: 0 }
    );

    return {
      x: totals.x / points.length,
      y: totals.y / points.length,
    };
  }

  let signedAreaAccumulator = 0;
  let centroidXAccumulator = 0;
  let centroidYAccumulator = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;

    signedAreaAccumulator += cross;
    centroidXAccumulator += (current.x + next.x) * cross;
    centroidYAccumulator += (current.y + next.y) * cross;
  }

  const signedArea = signedAreaAccumulator / 2;
  if (Math.abs(signedArea) <= 0.000001) {
    const totals = points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y,
      }),
      { x: 0, y: 0 }
    );

    return {
      x: totals.x / points.length,
      y: totals.y / points.length,
    };
  }

  return {
    x: centroidXAccumulator / (6 * signedArea),
    y: centroidYAccumulator / (6 * signedArea),
  };
}

function getCountLabelAnchor(points: Point2D[]): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  const totals = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
  };
}

function addClosedPolygonPathToCanvas(
  context: CanvasRenderingContext2D,
  points: Point2D[]
) {
  if (points.length < 3) {
    return;
  }

  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]!.x, points[index]!.y);
  }
  context.closePath();
}

function drawLabel(params: {
  context: CanvasRenderingContext2D;
  font: string;
  text: string;
  anchor: Point2D | null;
  scale: number;
  borderColor?: string;
  textColor?: string;
}) {
  if (!params.anchor || !params.text.trim()) {
    return;
  }

  const paddingX = LABEL_PADDING_X * params.scale;
  const paddingY = LABEL_PADDING_Y * params.scale;
  const fontSize = LABEL_FONT_SIZE * params.scale;

  params.context.save();
  params.context.font = fontSize >= 1 ? `600 ${fontSize}px sans-serif` : "600 11px sans-serif";
  params.context.textBaseline = "top";
  const metrics = params.context.measureText(params.text);
  const boxWidth = metrics.width + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const x = params.anchor.x - boxWidth / 2;
  const y = params.anchor.y - boxHeight - 8 * params.scale;

  params.context.fillStyle = LABEL_FILL_COLOR;
  params.context.strokeStyle = params.borderColor ?? LABEL_BORDER_COLOR;
  params.context.lineWidth = Math.max(1 * params.scale, 1);
  params.context.beginPath();
  params.context.rect(x, y, boxWidth, boxHeight);
  params.context.fill();
  params.context.stroke();

  params.context.fillStyle = params.textColor ?? LABEL_TEXT_COLOR;
  params.context.fillText(params.text, x + paddingX, y + paddingY);
  params.context.restore();
}

function drawAreaMeasurement(params: {
  context: CanvasRenderingContext2D;
  measurement: ExportTakeoffMeasurement;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}) {
  const { context, measurement, canvasWidth, canvasHeight, scale } = params;
  const colorHex = getMeasurementColor(measurement);
  const areaShapes = getExportAreaShapes(measurement);
  const includeShapes = areaShapes.filter((shape) => shape.role === "include");
  let largestArea = 0;
  let labelAnchor: Point2D | null = null;

  if (includeShapes.length > 0) {
    context.save();
    context.beginPath();
    areaShapes.forEach((shape) => {
      const points = shape.points.map((point) =>
        normalizedToCanvasPoint(point, canvasWidth, canvasHeight)
      );
      addClosedPolygonPathToCanvas(context, points);
    });
    context.fillStyle = hexToRgba(colorHex, AREA_FILL_ALPHA);
    context.fill("evenodd");
    context.restore();
  }

  areaShapes.forEach((shape) => {
    const points = shape.points.map((point) =>
      normalizedToCanvasPoint(point, canvasWidth, canvasHeight)
    );
    if (points.length < 3) {
      return;
    }

    if (shape.role !== "include") {
      return;
    }

    context.save();
    context.beginPath();
    addClosedPolygonPathToCanvas(context, points);
    context.strokeStyle = colorHex;
    context.lineWidth = Math.max(AREA_STROKE_WIDTH * scale, 1.5);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
    context.restore();

    const area = getPolygonArea(points);
    const centroid = getPolygonCentroid(points);
    if (centroid && area >= largestArea) {
      largestArea = area;
      labelAnchor = centroid;
    }
  });

  drawLabel({
    context,
    font: "sans-serif",
    text: getMeasurementLabelText(measurement),
    anchor: labelAnchor,
    scale,
    borderColor: colorHex,
  });
}

function drawLineMeasurement(params: {
  context: CanvasRenderingContext2D;
  measurement: ExportTakeoffMeasurement;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}) {
  const { context, measurement, canvasWidth, canvasHeight, scale } = params;
  const colorHex = getMeasurementColor(measurement);
  const linePaths = getExportLinePaths(measurement);
  let longestLength = 0;
  let labelAnchor: Point2D | null = null;

  linePaths.forEach((path) => {
    const points = path.points.map((point) =>
      normalizedToCanvasPoint(point, canvasWidth, canvasHeight)
    );
    if (points.length < 2) {
      return;
    }

    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.strokeStyle = colorHex;
    context.lineWidth = Math.max(LINE_STROKE_WIDTH * scale, 1.5);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
    context.restore();

    const length = getPolylineLength(points);
    const anchor = getPolylineLabelAnchor(points, 14 * scale);
    if (anchor && length >= longestLength) {
      longestLength = length;
      labelAnchor = anchor;
    }
  });

  drawLabel({
    context,
    font: "sans-serif",
    text: getMeasurementLabelText(measurement),
    anchor: labelAnchor,
    scale,
    borderColor: colorHex,
  });
}

function drawCountMeasurement(params: {
  context: CanvasRenderingContext2D;
  measurement: ExportTakeoffMeasurement;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}) {
  const { context, measurement, canvasWidth, canvasHeight, scale } = params;
  const colorHex = getMeasurementColor(measurement);
  const points = measurement.points.map((point) =>
    normalizedToCanvasPoint(point, canvasWidth, canvasHeight)
  );

  points.forEach((point) => {
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, Math.max(COUNT_RADIUS * scale, 3), 0, Math.PI * 2);
    context.fillStyle = colorHex;
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(2.5 * scale, 1.25);
    context.fill();
    context.stroke();
    context.restore();
  });

  drawLabel({
    context,
    font: "sans-serif",
    text: getMeasurementLabelText(measurement),
    anchor: getCountLabelAnchor(points),
    scale,
    borderColor: colorHex,
  });
}

function drawCalibration(params: {
  context: CanvasRenderingContext2D;
  calibration: ExportTakeoffCalibration;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}) {
  const { context, calibration, canvasWidth, canvasHeight, scale } = params;
  const pointA = normalizedToCanvasPoint(calibration.pointA, canvasWidth, canvasHeight);
  const pointB = normalizedToCanvasPoint(calibration.pointB, canvasWidth, canvasHeight);

  context.save();
  context.setLineDash([10 * scale, 7 * scale]);
  context.strokeStyle = CALIBRATION_STROKE_COLOR;
  context.lineWidth = Math.max(2.5 * scale, 1.25);
  context.beginPath();
  context.moveTo(pointA.x, pointA.y);
  context.lineTo(pointB.x, pointB.y);
  context.stroke();
  context.restore();

  [pointA, pointB].forEach((point) => {
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, Math.max(CALIBRATION_RADIUS * scale, 3), 0, Math.PI * 2);
    context.fillStyle = CALIBRATION_FILL_COLOR;
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(2 * scale, 1.25);
    context.fill();
    context.stroke();
    context.restore();
  });

  const midpoint = {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  };

  drawLabel({
    context,
    font: "sans-serif",
    text: `${calibration.referenceLengthInput} ${calibration.displayUnit}`,
    anchor: midpoint,
    scale,
    borderColor: CALIBRATION_FILL_COLOR,
    textColor: CALIBRATION_FILL_COLOR,
  });
}

function getLandscapePlacement(width: number, height: number) {
  const outputWidth = Math.max(width, height);
  const outputHeight = Math.min(width, height);
  const scale = Math.min(outputWidth / width, outputHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const offsetX = (outputWidth - drawWidth) / 2;
  const offsetY = (outputHeight - drawHeight) / 2;

  return {
    outputWidth,
    outputHeight,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateLegendText(value: string, maxChars: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(maxChars - 1, 0)).trimEnd()}...`;
}

function getLegendPlacement(params: {
  pageWidth: number;
  pageHeight: number;
  imageBounds: { x: number; y: number; width: number; height: number };
  cardWidth: number;
  cardHeight: number;
}) {
  const { pageWidth, pageHeight, imageBounds, cardWidth, cardHeight } = params;
  const pageMarginX = 24;
  const pageMarginY = 24;
  const imageInsetX = 16;
  const imageInsetY = 16;
  const edgePadding = 8;

  const preferredX = pageMarginX;
  const preferredY = pageMarginY;
  const shouldUseImageInset = imageBounds.x <= pageMarginX;

  const x = shouldUseImageInset ? imageBounds.x + imageInsetX : preferredX;
  const y = shouldUseImageInset ? imageBounds.y + imageInsetY : preferredY;

  return {
    x: clampNumber(x, edgePadding, Math.max(pageWidth - cardWidth - edgePadding, edgePadding)),
    y: clampNumber(y, edgePadding, Math.max(pageHeight - cardHeight - edgePadding, edgePadding)),
  };
}

function formatLegendQuantity(row: ExportTakeoffLegendRow) {
  const trimmedName = row.name.trim() || "Measurement";
  if (row.totalQuantity === null || !Number.isFinite(row.totalQuantity)) {
    return trimmedName;
  }

  const trimmedUnit = (row.unit ?? "").trim();
  const formattedQuantity = trimmedUnit.toLowerCase() === "count"
    ? row.totalQuantity.toFixed(0)
    : row.totalQuantity.toFixed(2);

  return `${trimmedName} · ${formattedQuantity}${trimmedUnit ? ` ${trimmedUnit}` : ""}`;
}

function drawExportLegend(params: {
  page: import("pdf-lib").PDFPage;
  imageBounds: { x: number; y: number; width: number; height: number };
  rows: ExportTakeoffLegendRow[];
}) {
  const { page, imageBounds, rows: legendRows } = params;
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const padding = 24;
  const titleGap = 20;
  const dividerGap = 14;
  const dividerSpacing = 16;
  const rowHeight = 28;
  const rowSpacing = 8;
  const swatchSize = 16;
  const swatchGap = 10;
  const fontSizeTitle = 20;
  const fontSizeRow = 16;
  const cardWidth = clampNumber(pageWidth * 0.28, 420, 560);
  const rowsHeight =
    legendRows.length > 0 ? legendRows.length * (rowHeight + rowSpacing) - rowSpacing : 0;
  const cardHeight = Math.max(122, padding + titleGap + dividerGap + dividerSpacing + rowsHeight + padding);
  const { x, y } = getLegendPlacement({
    pageWidth,
    pageHeight,
    imageBounds,
    cardWidth,
    cardHeight,
  });
  const backgroundColor = rgb(0.995, 0.995, 0.992);
  const borderColor = rgb(0.72, 0.77, 0.83);
  const dividerColor = rgb(0.85, 0.88, 0.92);
  const titleColor = rgb(0.11, 0.16, 0.24);
  const textColor = rgb(0.18, 0.22, 0.29);
  const maxTextChars = 48;

  page.drawRectangle({
    x,
    y,
    width: cardWidth,
    height: cardHeight,
    color: backgroundColor,
    borderColor,
    borderWidth: 1.2,
  });

  const titleY = y + cardHeight - padding - fontSizeTitle;
  page.drawText("Measurement Key", {
    x: x + padding,
    y: titleY,
    size: fontSizeTitle,
    color: titleColor,
  });

  const dividerY = titleY - dividerGap;
  page.drawLine({
    start: { x: x + padding, y: dividerY },
    end: { x: x + cardWidth - padding, y: dividerY },
    thickness: 1,
    color: dividerColor,
  });

  let currentY = dividerY - dividerSpacing - fontSizeRow;
  legendRows.forEach((row) => {
    const rowText = truncateLegendText(formatLegendQuantity(row), maxTextChars);
    const swatchY = currentY + Math.floor((fontSizeRow - swatchSize) / 2) + 1;

    page.drawRectangle({
      x: x + padding,
      y: swatchY,
      width: swatchSize,
      height: swatchSize,
      color: hexToPdfColor(row.colorHex),
    });

    page.drawText(rowText, {
      x: x + padding + swatchSize + swatchGap,
      y: currentY,
      size: fontSizeRow,
      color: textColor,
    });

    currentY -= rowHeight + rowSpacing;
  });
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
        return;
      }
      reject(new Error("Unable to prepare the export image."));
    }, "image/png");
  });

  return new Uint8Array(await blob.arrayBuffer());
}

async function yieldToMainThread() {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function assertPageNumber(pageNumber: number, pageCount: number) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new Error("The selected drawing page could not be exported.");
  }
}

export async function exportTakeoffPageToPdf(input: ExportTakeoffPageInput): Promise<Uint8Array> {
  const pdfjs = await loadPdfJsModule();
  const loadingTask = pdfjs.getDocument({
    url: input.pdfUrl,
    withCredentials: false,
  });

  try {
    const pdfDocument = await loadingTask.promise;
    assertPageNumber(input.pageNumber, pdfDocument.numPages);
    const pdfPage = await pdfDocument.getPage(input.pageNumber);
    const viewport = pdfPage.getViewport({
      scale: 2,
      rotation: input.rotation,
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(Math.floor(viewport.width), 1);
    canvas.height = Math.max(Math.floor(viewport.height), 1);

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Unable to create the export canvas.");
    }

    await pdfPage.render({
      canvasContext: context,
      viewport,
      background: "#ffffff",
    }).promise;

    const scaleX = canvas.width / Math.max(input.pageWidth, 1);
    const scaleY = canvas.height / Math.max(input.pageHeight, 1);
    const overlayScale = (scaleX + scaleY) / 2;

    for (let index = 0; index < input.measurements.length; index += 1) {
      const measurement = input.measurements[index];

      if (measurement.kind === "area") {
        drawAreaMeasurement({
          context,
          measurement,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          scale: overlayScale,
        });
      } else if (measurement.kind === "line") {
        drawLineMeasurement({
          context,
          measurement,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          scale: overlayScale,
        });
      } else {
        drawCountMeasurement({
          context,
          measurement,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          scale: overlayScale,
        });
      }

      if (index > 0 && index % 20 === 0) {
        await yieldToMainThread();
      }
    }

    if (input.calibration) {
      drawCalibration({
        context,
        calibration: input.calibration,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        scale: overlayScale,
      });
    }

    const pngBytes = await canvasToPngBytes(canvas);
    const exportPdf = await PDFDocument.create();
    const embeddedImage = await exportPdf.embedPng(pngBytes);
    const placement = getLandscapePlacement(embeddedImage.width, embeddedImage.height);
    const exportPage = exportPdf.addPage([placement.outputWidth, placement.outputHeight]);

    exportPage.drawImage(embeddedImage, {
      x: placement.offsetX,
      y: placement.offsetY,
      width: placement.drawWidth,
      height: placement.drawHeight,
    });

    if (input.legendRows && input.legendRows.length > 0) {
      drawExportLegend({
        page: exportPage,
        imageBounds: {
          x: placement.offsetX,
          y: placement.offsetY,
          width: placement.drawWidth,
          height: placement.drawHeight,
        },
        rows: input.legendRows,
      });
    }

    exportPdf.setTitle(`${input.projectName} - Marked Up Takeoff - ${input.pageName}`);
    exportPdf.setProducer("Tradesstack Takeoff Export");
    exportPdf.setCreator("Tradesstack");

    return exportPdf.save();
  } finally {
    await loadingTask.destroy?.();
  }
}
