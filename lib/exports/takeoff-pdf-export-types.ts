export type ExportTakeoffRotation = 0 | 90 | 180 | 270;

export interface ExportTakeoffPoint {
  x: number;
  y: number;
}

export interface ExportTakeoffAreaShape {
  id: string;
  points: ExportTakeoffPoint[];
}

export interface ExportTakeoffLinePath {
  id: string;
  points: ExportTakeoffPoint[];
}

export interface ExportTakeoffMeasurement {
  id: string;
  kind: "line" | "area" | "count";
  colorHex: string;
  name: string;
  description: string;
  label: string;
  points: ExportTakeoffPoint[];
  areaShapes: ExportTakeoffAreaShape[];
  linePaths: ExportTakeoffLinePath[];
}

export interface ExportTakeoffLegendRow {
  id: string;
  colorHex: string;
  name: string;
  totalQuantity: number | null;
  unit: string | null;
}

export interface ExportTakeoffCalibration {
  name: string;
  displayUnit: string;
  referenceLengthInput: number;
  pointA: ExportTakeoffPoint;
  pointB: ExportTakeoffPoint;
}

export interface ExportTakeoffPageInput {
  pdfUrl: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  rotation: ExportTakeoffRotation;
  measurements: ExportTakeoffMeasurement[];
  legendRows: ExportTakeoffLegendRow[];
  calibration: ExportTakeoffCalibration | null;
  projectName: string;
  pageName: string;
}
