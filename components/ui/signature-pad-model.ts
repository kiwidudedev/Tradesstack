export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

export type SignatureArtifactMetadata = {
  schemaVersion: 1;
  rendererVersion: 1;
  mimeType: "image/png";
  logicalWidth: number;
  logicalHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  devicePixelRatio: number;
  strokeCount: number;
  pointCount: number;
  totalDistance: number;
  bounds: { x: number; y: number; width: number; height: number };
};

export const SIGNATURE_MIN_POINTS = 3;
export const SIGNATURE_MIN_DISTANCE = 20;
export const SIGNATURE_MIN_BOUND_WIDTH = 12;
export const SIGNATURE_MIN_BOUND_HEIGHT = 8;
export const SIGNATURE_DPR_CAP = 3;

export function analyzeSignature(strokes: SignatureStroke[], logicalWidth: number, logicalHeight: number) {
  const points = strokes.flat();
  let totalDistance = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      totalDistance += Math.hypot(
        (stroke[index].x - stroke[index - 1].x) * logicalWidth,
        (stroke[index].y - stroke[index - 1].y) * logicalHeight,
      );
    }
  }
  const xs = points.map((point) => point.x * logicalWidth);
  const ys = points.map((point) => point.y * logicalHeight);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  return {
    strokeCount: strokes.filter((stroke) => stroke.length > 0).length,
    pointCount: points.length,
    totalDistance,
    bounds,
    meaningful: strokes.length >= 1
      && points.length >= SIGNATURE_MIN_POINTS
      && totalDistance >= SIGNATURE_MIN_DISTANCE
      && bounds.width >= SIGNATURE_MIN_BOUND_WIDTH
      && bounds.height >= SIGNATURE_MIN_BOUND_HEIGHT,
  };
}

export function signatureMetadataIsMeaningful(value: unknown): value is SignatureArtifactMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Partial<SignatureArtifactMetadata>;
  if (!metadata.bounds || typeof metadata.bounds !== "object") return false;
  const numericValues = [
    metadata.logicalWidth, metadata.logicalHeight, metadata.pixelWidth, metadata.pixelHeight,
    metadata.devicePixelRatio, metadata.strokeCount, metadata.pointCount, metadata.totalDistance,
    metadata.bounds.x, metadata.bounds.y, metadata.bounds.width, metadata.bounds.height,
  ];
  if (!numericValues.every((item) => typeof item === "number" && Number.isFinite(item))) return false;
  return metadata.schemaVersion === 1
    && metadata.rendererVersion === 1
    && metadata.mimeType === "image/png"
    && metadata.logicalWidth! >= 100 && metadata.logicalWidth! <= 2000
    && metadata.logicalHeight! >= 100 && metadata.logicalHeight! <= 800
    && metadata.pixelWidth! >= 100 && metadata.pixelWidth! <= 4096
    && metadata.pixelHeight! >= 100 && metadata.pixelHeight! <= 2048
    && metadata.devicePixelRatio! >= 1 && metadata.devicePixelRatio! <= SIGNATURE_DPR_CAP
    && Math.abs(metadata.pixelWidth! - Math.round(metadata.logicalWidth! * metadata.devicePixelRatio!)) <= 1
    && Math.abs(metadata.pixelHeight! - Math.round(metadata.logicalHeight! * metadata.devicePixelRatio!)) <= 1
    && metadata.strokeCount! >= 1
    && metadata.pointCount! >= SIGNATURE_MIN_POINTS
    && metadata.totalDistance! >= SIGNATURE_MIN_DISTANCE
    && metadata.bounds.width >= SIGNATURE_MIN_BOUND_WIDTH
    && metadata.bounds.height >= SIGNATURE_MIN_BOUND_HEIGHT;
}
