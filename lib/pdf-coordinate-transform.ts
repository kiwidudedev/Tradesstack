export interface Size2D {
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export type RotationDegrees = 0 | 90 | 180 | 270;
export type ViewportOrigin = "center" | "top-left";

export interface ViewerStageMetrics {
  fitScale: number;
  committedScale: number;
  displayedScale: number;
  committedCssWidth: number;
  committedCssHeight: number;
  displayedCssWidth: number;
  displayedCssHeight: number;
  defaultPanX: number;
  minPanX: number;
  maxPanX: number;
  defaultPanY: number;
  minPanY: number;
  maxPanY: number;
  boundedPanX: number;
  boundedPanY: number;
  effectiveZoom: number;
}

export interface CalibrationScale {
  unitsPerPagePoint: number;
  squareUnitsPerSquarePagePoint: number;
  referenceLength: number;
  displayUnit: string;
}

export type SnapTargetKind = "draft-closure" | "vertex" | "segment";

export interface SnapCandidate {
  key: string;
  kind: SnapTargetKind;
  point: Point2D;
  distance: number;
  priority: number;
}

export interface PdfViewportTransform {
  rawPdfSize: Size2D;
  documentSize: Size2D;
  viewportSize: Size2D;
  rotation: RotationDegrees;
  viewportOrigin: ViewportOrigin;
  pan: Point2D;
  metrics: ViewerStageMetrics;
  pdfPointToDocumentPoint: (point: Point2D) => Point2D;
  documentPointToPdfPoint: (point: Point2D) => Point2D;
  normalizedPointToDocumentPoint: (point: NormalizedPoint) => Point2D;
  documentPointToNormalizedPoint: (point: Point2D) => NormalizedPoint;
  documentPointToCommittedStagePoint: (point: Point2D) => Point2D;
  committedStagePointToDocumentPoint: (point: Point2D) => Point2D;
  documentPointToViewportPoint: (point: Point2D) => Point2D;
  viewportPointToDocumentPoint: (point: Point2D) => Point2D;
  documentDistanceToViewportDistance: (distance: number) => number;
  viewportDistanceToDocumentDistance: (distance: number) => number;
  clientPointToViewportPoint: (clientPoint: Point2D, viewportRect: Pick<DOMRect, "left" | "top">) => Point2D;
  clientPointToDocumentPoint: (clientPoint: Point2D, viewportRect: Pick<DOMRect, "left" | "top">) => Point2D;
  normalizedPointToViewportPoint: (point: NormalizedPoint) => Point2D;
  clampPan: (pan: Point2D) => Point2D;
  getFocalZoomPan: (params: { pointer: Point2D; currentPan: Point2D; currentTransientZoom: number; nextTransientZoom: number }) => Point2D;
}

const VIEWER_PADDING_PX = 48;
const MIN_FIT_SCALE = 0.1;
const WORKSPACE_CAMERA_VIEWPORT_RATIO = 0.9;
const WORKSPACE_CAMERA_STAGE_RATIO = 0.25;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeRotationDegrees(rotationDegrees: number): RotationDegrees {
  const normalized = ((Math.round(rotationDegrees) % 360) + 360) % 360;

  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }

  return 0;
}

export function getRotatedPageSize(pageSize: Size2D, rotationDegrees: number): Size2D {
  const rotation = normalizeRotationDegrees(rotationDegrees);

  if (rotation === 90 || rotation === 270) {
    return {
      width: pageSize.height,
      height: pageSize.width,
    };
  }

  return {
    width: pageSize.width,
    height: pageSize.height,
  };
}

export function clampPanToStage(
  pan: Point2D,
  metrics: Pick<ViewerStageMetrics, "minPanX" | "maxPanX" | "minPanY" | "maxPanY">
): Point2D {
  return {
    x: clamp(pan.x, metrics.minPanX, metrics.maxPanX),
    y: clamp(pan.y, metrics.minPanY, metrics.maxPanY),
  };
}

export function getViewerStageMetrics(params: {
  viewportSize: Size2D;
  documentSize: Size2D;
  committedZoom: number;
  transientZoom: number;
  pan: Point2D;
  viewportOrigin?: ViewportOrigin;
  allowUnderfitPan?: boolean;
  underfitPanViewportRatio?: number;
  allowExpandedOverflowBounds?: boolean;
  overflowBiasMarginViewportRatio?: number;
}): ViewerStageMetrics {
  const paddedViewportWidth = Math.max(params.viewportSize.width - VIEWER_PADDING_PX, 1);
  const paddedViewportHeight = Math.max(params.viewportSize.height - VIEWER_PADDING_PX, 1);
  const documentWidth = Math.max(params.documentSize.width, 1);
  const documentHeight = Math.max(params.documentSize.height, 1);
  const fitScale = Math.max(
    MIN_FIT_SCALE,
    Math.min(paddedViewportWidth / documentWidth, paddedViewportHeight / documentHeight)
  );
  const committedScale = fitScale * params.committedZoom;
  const displayedScale = committedScale * params.transientZoom;
  const committedCssWidth = Math.max(documentWidth * committedScale, 1);
  const committedCssHeight = Math.max(documentHeight * committedScale, 1);
  const displayedCssWidth = Math.max(documentWidth * displayedScale, 1);
  const displayedCssHeight = Math.max(documentHeight * displayedScale, 1);
  const overflowPanX = Math.max(0, (displayedCssWidth - params.viewportSize.width) / 2);
  const overflowPanY = Math.max(0, (displayedCssHeight - params.viewportSize.height) / 2);
  const overflowBiasMarginViewportRatio = params.overflowBiasMarginViewportRatio ?? 0;
  const overflowBiasMarginX =
    params.allowExpandedOverflowBounds && displayedCssWidth > params.viewportSize.width
      ? Math.max(params.viewportSize.width * overflowBiasMarginViewportRatio, 0)
      : 0;
  const overflowBiasMarginY =
    params.allowExpandedOverflowBounds && displayedCssHeight > params.viewportSize.height
      ? Math.max(params.viewportSize.height * overflowBiasMarginViewportRatio, 0)
      : 0;
  const workspacePanMarginX = params.allowExpandedOverflowBounds
    ? Math.max(
        overflowBiasMarginX,
        params.viewportSize.width * WORKSPACE_CAMERA_VIEWPORT_RATIO,
        displayedCssWidth * WORKSPACE_CAMERA_STAGE_RATIO
      )
    : overflowBiasMarginX;
  const workspacePanMarginY = params.allowExpandedOverflowBounds
    ? Math.max(
        overflowBiasMarginY,
        params.viewportSize.height * WORKSPACE_CAMERA_VIEWPORT_RATIO,
        displayedCssHeight * WORKSPACE_CAMERA_STAGE_RATIO
      )
    : overflowBiasMarginY;
  const underfitPanViewportRatio = params.underfitPanViewportRatio ?? 0.2;
  const underfitPanLimitX = Math.max(params.viewportSize.width * underfitPanViewportRatio, 0);
  const underfitPanLimitY = Math.max(params.viewportSize.height * underfitPanViewportRatio, 0);
  const underfitPanX = Math.min(Math.max(0, (params.viewportSize.width - displayedCssWidth) / 2), underfitPanLimitX);
  const underfitPanY = Math.min(Math.max(0, (params.viewportSize.height - displayedCssHeight) / 2), underfitPanLimitY);
  const viewportOrigin = params.viewportOrigin ?? "center";
  let defaultPanX = 0;
  let minPanX = 0;
  let maxPanX = 0;
  let defaultPanY = 0;
  let minPanY = 0;
  let maxPanY = 0;

  if (viewportOrigin === "top-left") {
    if (displayedCssWidth > params.viewportSize.width) {
      defaultPanX = 0;
      minPanX = params.viewportSize.width - displayedCssWidth - workspacePanMarginX;
      maxPanX = workspacePanMarginX;
    } else {
      defaultPanX = (params.viewportSize.width - displayedCssWidth) / 2;
      if (params.allowUnderfitPan) {
        minPanX = defaultPanX - Math.max(underfitPanX, workspacePanMarginX);
        maxPanX = defaultPanX + Math.max(underfitPanX, workspacePanMarginX);
      } else {
        minPanX = defaultPanX;
        maxPanX = defaultPanX;
      }
    }

    if (displayedCssHeight > params.viewportSize.height) {
      defaultPanY = 0;
      minPanY = params.viewportSize.height - displayedCssHeight - workspacePanMarginY;
      maxPanY = workspacePanMarginY;
    } else {
      defaultPanY = (params.viewportSize.height - displayedCssHeight) / 2;
      if (params.allowUnderfitPan) {
        minPanY = defaultPanY - Math.max(underfitPanY, workspacePanMarginY);
        maxPanY = defaultPanY + Math.max(underfitPanY, workspacePanMarginY);
      } else {
        minPanY = defaultPanY;
        maxPanY = defaultPanY;
      }
    }
  } else {
    const overflowMinPanX = -(overflowPanX + overflowBiasMarginX);
    const overflowMaxPanX = overflowPanX + overflowBiasMarginX;
    const overflowMinPanY = -(overflowPanY + overflowBiasMarginY);
    const overflowMaxPanY = overflowPanY + overflowBiasMarginY;
    defaultPanX = 0;
    defaultPanY = 0;
    minPanX = params.allowUnderfitPan ? Math.min(overflowMinPanX, -underfitPanX) : overflowMinPanX;
    maxPanX = params.allowUnderfitPan ? Math.max(overflowMaxPanX, underfitPanX) : overflowMaxPanX;
    minPanY = params.allowUnderfitPan ? Math.min(overflowMinPanY, -underfitPanY) : overflowMinPanY;
    maxPanY = params.allowUnderfitPan ? Math.max(overflowMaxPanY, underfitPanY) : overflowMaxPanY;
  }

  const boundedPan = clampPanToStage(params.pan, { minPanX, maxPanX, minPanY, maxPanY });

  return {
    fitScale,
    committedScale,
    displayedScale,
    committedCssWidth,
    committedCssHeight,
    displayedCssWidth,
    displayedCssHeight,
    defaultPanX,
    minPanX,
    maxPanX,
    defaultPanY,
    minPanY,
    maxPanY,
    boundedPanX: boundedPan.x,
    boundedPanY: boundedPan.y,
    effectiveZoom: params.committedZoom * params.transientZoom,
  };
}

export function getViewportRelativePoint(params: {
  clientX: number;
  clientY: number;
  viewportRect: Pick<DOMRect, "left" | "top" | "width" | "height">;
}): Point2D {
  return {
    x: params.clientX - params.viewportRect.left - params.viewportRect.width / 2,
    y: params.clientY - params.viewportRect.top - params.viewportRect.height / 2,
  };
}

export function applyFocalPointZoom(params: {
  pointer: Point2D;
  currentPan: Point2D;
  currentTransientZoom: number;
  nextTransientZoom: number;
}): Point2D {
  const localX = (params.pointer.x - params.currentPan.x) / params.currentTransientZoom;
  const localY = (params.pointer.y - params.currentPan.y) / params.currentTransientZoom;

  return {
    x: params.pointer.x - localX * params.nextTransientZoom,
    y: params.pointer.y - localY * params.nextTransientZoom,
  };
}

export function normalizedPointToPagePoint(point: NormalizedPoint, pageSize: Size2D): Point2D {
  return {
    x: point.x * pageSize.width,
    y: point.y * pageSize.height,
  };
}

export function pagePointToNormalizedPoint(point: Point2D, pageSize: Size2D): NormalizedPoint {
  return {
    x: pageSize.width > 0 ? point.x / pageSize.width : 0,
    y: pageSize.height > 0 ? point.y / pageSize.height : 0,
  };
}

export function normalizedPointsToPagePath(points: NormalizedPoint[], pageSize: Size2D): string {
  return points
    .map((point) => {
      const projected = normalizedPointToPagePoint(point, pageSize);
      return `${projected.x},${projected.y}`;
    })
    .join(" ");
}

export function documentPointsToPath(points: Point2D[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function documentPointsToNormalizedPoints(points: Point2D[], pageSize: Size2D): NormalizedPoint[] {
  return points.map((point) => pagePointToNormalizedPoint(point, pageSize));
}

export function clampDocumentPointToBounds(point: Point2D, documentSize: Size2D): Point2D {
  return {
    x: clamp(point.x, 0, documentSize.width),
    y: clamp(point.y, 0, documentSize.height),
  };
}

export function getNormalizedPointAnchor(points: NormalizedPoint[]): NormalizedPoint | null {
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

export function rotatePdfPointToDocumentPoint(point: Point2D, rawPageSize: Size2D, rotationDegrees: number): Point2D {
  const rotation = normalizeRotationDegrees(rotationDegrees);

  if (rotation === 90) {
    return {
      x: rawPageSize.height - point.y,
      y: point.x,
    };
  }

  if (rotation === 180) {
    return {
      x: rawPageSize.width - point.x,
      y: rawPageSize.height - point.y,
    };
  }

  if (rotation === 270) {
    return {
      x: point.y,
      y: rawPageSize.width - point.x,
    };
  }

  return { x: point.x, y: point.y };
}

export function rotateDocumentPointToPdfPoint(point: Point2D, rawPageSize: Size2D, rotationDegrees: number): Point2D {
  const rotation = normalizeRotationDegrees(rotationDegrees);

  if (rotation === 90) {
    return {
      x: point.y,
      y: rawPageSize.height - point.x,
    };
  }

  if (rotation === 180) {
    return {
      x: rawPageSize.width - point.x,
      y: rawPageSize.height - point.y,
    };
  }

  if (rotation === 270) {
    return {
      x: rawPageSize.width - point.y,
      y: point.x,
    };
  }

  return { x: point.x, y: point.y };
}

export function getDistanceBetweenPoints(pointA: Point2D, pointB: Point2D): number {
  return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
}

export function getNearestPointOnSegment(params: {
  point: Point2D;
  segmentStart: Point2D;
  segmentEnd: Point2D;
}): Point2D {
  const deltaX = params.segmentEnd.x - params.segmentStart.x;
  const deltaY = params.segmentEnd.y - params.segmentStart.y;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (segmentLengthSquared <= 0) {
    return { ...params.segmentStart };
  }

  const t = clamp(
    ((params.point.x - params.segmentStart.x) * deltaX + (params.point.y - params.segmentStart.y) * deltaY) /
      segmentLengthSquared,
    0,
    1
  );

  return {
    x: params.segmentStart.x + deltaX * t,
    y: params.segmentStart.y + deltaY * t,
  };
}

export function getDistanceFromPointToSegment(params: {
  point: Point2D;
  segmentStart: Point2D;
  segmentEnd: Point2D;
}): number {
  const nearestPoint = getNearestPointOnSegment(params);
  return getDistanceBetweenPoints(params.point, nearestPoint);
}

export function getPointHit(params: {
  point: Point2D;
  target: Point2D;
  tolerance: number;
}): { hit: boolean; distance: number } {
  const distance = getDistanceBetweenPoints(params.point, params.target);
  return {
    hit: distance <= params.tolerance,
    distance,
  };
}

export function getLineMidpoint(pointA: Point2D, pointB: Point2D): Point2D {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  };
}

export function getLineLabelPosition(params: {
  pointA: Point2D;
  pointB: Point2D;
  offsetDistance: number;
}): Point2D {
  const midpoint = getLineMidpoint(params.pointA, params.pointB);
  const deltaX = params.pointB.x - params.pointA.x;
  const deltaY = params.pointB.y - params.pointA.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length <= 0) {
    return midpoint;
  }

  const normalX = -deltaY / length;
  const normalY = deltaX / length;

  return {
    x: midpoint.x + normalX * params.offsetDistance,
    y: midpoint.y + normalY * params.offsetDistance,
  };
}

export function getPolylineLength(points: Point2D[]): number {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += getDistanceBetweenPoints(points[index - 1], points[index]);
  }

  return length;
}

export function getPointAlongPolyline(points: Point2D[], distance: number): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  const targetDistance = clamp(distance, 0, getPolylineLength(points));
  let traversedDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentStart = points[index - 1];
    const segmentEnd = points[index];
    const segmentLength = getDistanceBetweenPoints(segmentStart, segmentEnd);

    if (segmentLength <= 0) {
      continue;
    }

    if (traversedDistance + segmentLength >= targetDistance) {
      const remaining = targetDistance - traversedDistance;
      const ratio = remaining / segmentLength;
      return {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
      };
    }

    traversedDistance += segmentLength;
  }

  return points[points.length - 1];
}

export function getPolylineLabelPosition(points: Point2D[], offsetDistance: number): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  const totalLength = getPolylineLength(points);
  const midpointDistance = totalLength / 2;
  let traversedDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentStart = points[index - 1];
    const segmentEnd = points[index];
    const segmentLength = getDistanceBetweenPoints(segmentStart, segmentEnd);

    if (segmentLength <= 0) {
      continue;
    }

    if (traversedDistance + segmentLength >= midpointDistance) {
      const anchor =
        getPointAlongPolyline(points, midpointDistance) ??
        getLineMidpoint(segmentStart, segmentEnd);

      const deltaX = segmentEnd.x - segmentStart.x;
      const deltaY = segmentEnd.y - segmentStart.y;
      const normalX = -deltaY / segmentLength;
      const normalY = deltaX / segmentLength;

      return {
        x: anchor.x + normalX * offsetDistance,
        y: anchor.y + normalY * offsetDistance,
      };
    }

    traversedDistance += segmentLength;
  }

  return points[points.length - 1];
}

export function getPolygonArea(points: Point2D[]): number {
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

export function getPolygonCentroid(points: Point2D[]): Point2D | null {
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

export function getPolygonLabelPosition(points: Point2D[]): Point2D | null {
  return getPolygonCentroid(points);
}

export function getNearestPointHit(params: {
  point: Point2D;
  targets: Point2D[];
  tolerance: number;
}): { hit: boolean; index: number; distance: number } {
  if (params.targets.length === 0) {
    return { hit: false, index: -1, distance: Number.POSITIVE_INFINITY };
  }

  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  params.targets.forEach((target, index) => {
    const distance = getDistanceBetweenPoints(params.point, target);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });

  return {
    hit: nearestDistance <= params.tolerance,
    index: nearestIndex,
    distance: nearestDistance,
  };
}

export function getSnapToleranceInDocumentSpace(params: {
  viewportTolerance: number;
  viewportDistanceToDocumentDistance: (distance: number) => number;
}): number {
  return params.viewportDistanceToDocumentDistance(params.viewportTolerance);
}

export function getZoomAdjustedViewportTolerance(params: {
  baseTolerance: number;
  effectiveZoom: number;
  minTolerance?: number;
  maxTolerance?: number;
}): number {
  const minTolerance = params.minTolerance ?? Math.max(8, params.baseTolerance * 0.7);
  const maxTolerance = params.maxTolerance ?? Math.max(minTolerance, params.baseTolerance * 1.25);
  const normalizedZoom = Math.max(params.effectiveZoom, 0.1);
  const adjustedTolerance = params.baseTolerance / Math.sqrt(normalizedZoom);
  return clamp(adjustedTolerance, minTolerance, maxTolerance);
}

export function getNearestVertexSnapCandidate(params: {
  point: Point2D;
  targets: Point2D[];
  tolerance: number;
  priority?: number;
}): SnapCandidate | null {
  const nearestHit = getNearestPointHit({
    point: params.point,
    targets: params.targets,
    tolerance: params.tolerance,
  });

  if (!nearestHit.hit || nearestHit.index < 0) {
    return null;
  }

  return {
    key: `vertex:${nearestHit.index}:${params.targets[nearestHit.index]?.x ?? 0}:${params.targets[nearestHit.index]?.y ?? 0}`,
    kind: "vertex",
    point: params.targets[nearestHit.index],
    distance: nearestHit.distance,
    priority: params.priority ?? 20,
  };
}

export function getPolylineHit(params: {
  point: Point2D;
  polyline: Point2D[];
  tolerance: number;
}): { hit: boolean; distance: number } {
  if (params.polyline.length < 2) {
    return { hit: false, distance: Number.POSITIVE_INFINITY };
  }

  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < params.polyline.length; index += 1) {
    minimumDistance = Math.min(
      minimumDistance,
      getDistanceFromPointToSegment({
        point: params.point,
        segmentStart: params.polyline[index - 1],
        segmentEnd: params.polyline[index],
      })
    );
  }

  return {
    hit: minimumDistance <= params.tolerance,
    distance: minimumDistance,
  };
}

export function getNearestSegmentSnapCandidate(params: {
  point: Point2D;
  polyline: Point2D[];
  tolerance: number;
  closed?: boolean;
  priority?: number;
}): SnapCandidate | null {
  if (params.polyline.length < 2) {
    return null;
  }

  const isClosed = params.closed ?? false;
  const segmentCount = isClosed ? params.polyline.length : params.polyline.length - 1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestPoint: Point2D | null = null;

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentStart = params.polyline[index];
    const segmentEnd = params.polyline[(index + 1) % params.polyline.length];
    const candidatePoint = getNearestPointOnSegment({
      point: params.point,
      segmentStart,
      segmentEnd,
    });
    const candidateDistance = getDistanceBetweenPoints(params.point, candidatePoint);

    if (candidateDistance < nearestDistance) {
      nearestDistance = candidateDistance;
      nearestPoint = candidatePoint;
    }
  }

  if (!nearestPoint || nearestDistance > params.tolerance) {
    return null;
  }

  return {
    key: `segment:${nearestPoint.x}:${nearestPoint.y}:${segmentCount}:${isClosed ? "closed" : "open"}`,
    kind: "segment",
    point: nearestPoint,
    distance: nearestDistance,
    priority: params.priority ?? 40,
  };
}

export function getPolygonHit(params: {
  point: Point2D;
  polygon: Point2D[];
  tolerance: number;
}): { hit: boolean; distance: number } {
  if (params.polygon.length < 2) {
    return { hit: false, distance: Number.POSITIVE_INFINITY };
  }

  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < params.polygon.length; index += 1) {
    minimumDistance = Math.min(
      minimumDistance,
      getDistanceFromPointToSegment({
        point: params.point,
        segmentStart: params.polygon[index],
        segmentEnd: params.polygon[(index + 1) % params.polygon.length],
      })
    );
  }

  return {
    hit: minimumDistance <= params.tolerance,
    distance: minimumDistance,
  };
}

export function isPointNearClosingTarget(params: {
  point: Point2D;
  firstPoint: Point2D | null;
  tolerance: number;
  minimumPointsBeforeClose?: number;
  currentPointCount: number;
}): boolean {
  if (!params.firstPoint) {
    return false;
  }

  const minimumPointsBeforeClose = params.minimumPointsBeforeClose ?? 3;
  if (params.currentPointCount < minimumPointsBeforeClose) {
    return false;
  }

  return getDistanceBetweenPoints(params.point, params.firstPoint) <= params.tolerance;
}

export function getDraftClosureSnapCandidate(params: {
  point: Point2D;
  firstPoint: Point2D | null;
  tolerance: number;
  currentPointCount: number;
  minimumPointsBeforeClose?: number;
  priority?: number;
}): SnapCandidate | null {
  if (
    !isPointNearClosingTarget({
      point: params.point,
      firstPoint: params.firstPoint,
      tolerance: params.tolerance,
      currentPointCount: params.currentPointCount,
      minimumPointsBeforeClose: params.minimumPointsBeforeClose,
    }) ||
    !params.firstPoint
  ) {
    return null;
  }

  return {
    key: `draft-closure:${params.firstPoint.x}:${params.firstPoint.y}`,
    kind: "draft-closure",
    point: params.firstPoint,
    distance: getDistanceBetweenPoints(params.point, params.firstPoint),
    priority: params.priority ?? 0,
  };
}

export function getStableSnapCandidate(params: {
  candidates: Array<SnapCandidate | null | undefined>;
  currentCandidate?: SnapCandidate | null;
  currentCandidateTolerance?: number;
}): SnapCandidate | null {
  const bestCandidate = getBestSnapCandidate(params.candidates);
  if (!params.currentCandidate) {
    return bestCandidate;
  }

  const viableCandidates = params.candidates.filter((candidate): candidate is SnapCandidate => Boolean(candidate));
  if (viableCandidates.length === 0) {
    return null;
  }

  const stickyTolerance = params.currentCandidateTolerance ?? Number.POSITIVE_INFINITY;
  const matchingCandidate = viableCandidates.find(
    (candidate) =>
      candidate.kind === params.currentCandidate?.kind &&
      getDistanceBetweenPoints(candidate.point, params.currentCandidate!.point) <= stickyTolerance
  );

  if (!matchingCandidate) {
    return bestCandidate;
  }

  if (!bestCandidate) {
    return matchingCandidate;
  }

  const isHigherPriority = matchingCandidate.priority < bestCandidate.priority;
  const isComparablePriority = matchingCandidate.priority === bestCandidate.priority;
  const isCloseInDistance = matchingCandidate.distance <= bestCandidate.distance * 1.2;

  if (isHigherPriority || (isComparablePriority && isCloseInDistance)) {
    return matchingCandidate;
  }

  return bestCandidate;
}

export function getBestSnapCandidate(candidates: Array<SnapCandidate | null | undefined>): SnapCandidate | null {
  const viableCandidates = candidates.filter((candidate): candidate is SnapCandidate => Boolean(candidate));

  if (viableCandidates.length === 0) {
    return null;
  }

  viableCandidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.distance - right.distance;
  });

  return viableCandidates[0] ?? null;
}

export function getCalibrationScale(params: {
  pointA: Point2D;
  pointB: Point2D;
  referenceLength: number;
  displayUnit: string;
}): CalibrationScale | null {
  const pageDistance = getDistanceBetweenPoints(params.pointA, params.pointB);

  if (!Number.isFinite(pageDistance) || pageDistance <= 0 || !Number.isFinite(params.referenceLength) || params.referenceLength <= 0) {
    return null;
  }

  const unitsPerPagePoint = params.referenceLength / pageDistance;

  return {
    unitsPerPagePoint,
    squareUnitsPerSquarePagePoint: unitsPerPagePoint * unitsPerPagePoint,
    referenceLength: params.referenceLength,
    displayUnit: params.displayUnit,
  };
}

export function convertDocumentDistanceToRealWorld(distanceInPagePoints: number, calibration: CalibrationScale | null): number | null {
  if (!calibration || !Number.isFinite(distanceInPagePoints)) {
    return null;
  }

  return distanceInPagePoints * calibration.unitsPerPagePoint;
}

export function convertDocumentAreaToRealWorld(areaInSquarePagePoints: number, calibration: CalibrationScale | null): number | null {
  if (!calibration || !Number.isFinite(areaInSquarePagePoints)) {
    return null;
  }

  return areaInSquarePagePoints * calibration.squareUnitsPerSquarePagePoint;
}

export function createPdfViewportTransform(params: {
  viewportSize: Size2D;
  documentSize: Size2D;
  committedZoom: number;
  transientZoom: number;
  pan: Point2D;
  rotationDegrees?: number;
  viewportOrigin?: ViewportOrigin;
  allowUnderfitPan?: boolean;
  underfitPanViewportRatio?: number;
  allowExpandedOverflowBounds?: boolean;
  overflowBiasMarginViewportRatio?: number;
}): PdfViewportTransform {
  const viewportOrigin = params.viewportOrigin ?? "center";
  const rotation = normalizeRotationDegrees(params.rotationDegrees ?? 0);
  const rawPdfSize =
    rotation === 90 || rotation === 270
      ? { width: params.documentSize.height, height: params.documentSize.width }
      : { width: params.documentSize.width, height: params.documentSize.height };
  const metrics = getViewerStageMetrics({
    viewportSize: params.viewportSize,
    documentSize: params.documentSize,
    committedZoom: params.committedZoom,
    transientZoom: params.transientZoom,
    pan: params.pan,
    viewportOrigin,
    allowUnderfitPan: params.allowUnderfitPan,
    underfitPanViewportRatio: params.underfitPanViewportRatio,
    allowExpandedOverflowBounds: params.allowExpandedOverflowBounds,
    overflowBiasMarginViewportRatio: params.overflowBiasMarginViewportRatio,
  });

  function normalizedPointToDocumentPoint(point: NormalizedPoint): Point2D {
    return normalizedPointToPagePoint(point, params.documentSize);
  }

  function pdfPointToDocumentPoint(point: Point2D): Point2D {
    return rotatePdfPointToDocumentPoint(point, rawPdfSize, rotation);
  }

  function documentPointToPdfPoint(point: Point2D): Point2D {
    return rotateDocumentPointToPdfPoint(point, rawPdfSize, rotation);
  }

  function documentPointToNormalizedPoint(point: Point2D): NormalizedPoint {
    return pagePointToNormalizedPoint(point, params.documentSize);
  }

  function documentPointToCommittedStagePoint(point: Point2D): Point2D {
    return {
      x: point.x * metrics.committedScale,
      y: point.y * metrics.committedScale,
    };
  }

  function committedStagePointToDocumentPoint(point: Point2D): Point2D {
    return {
      x: metrics.committedScale > 0 ? point.x / metrics.committedScale : 0,
      y: metrics.committedScale > 0 ? point.y / metrics.committedScale : 0,
    };
  }

  function documentPointToViewportPoint(point: Point2D): Point2D {
    if (viewportOrigin === "top-left") {
      return {
        x: metrics.boundedPanX + point.x * metrics.displayedScale,
        y: metrics.boundedPanY + point.y * metrics.displayedScale,
      };
    }

    return {
      x: params.viewportSize.width / 2 + metrics.boundedPanX + (point.x - params.documentSize.width / 2) * metrics.displayedScale,
      y: params.viewportSize.height / 2 + metrics.boundedPanY + (point.y - params.documentSize.height / 2) * metrics.displayedScale,
    };
  }

  function viewportPointToDocumentPoint(point: Point2D): Point2D {
    if (viewportOrigin === "top-left") {
      return {
        x: (point.x - metrics.boundedPanX) / (metrics.displayedScale || 1),
        y: (point.y - metrics.boundedPanY) / (metrics.displayedScale || 1),
      };
    }

    return {
      x:
        params.documentSize.width / 2 +
        (point.x - params.viewportSize.width / 2 - metrics.boundedPanX) / (metrics.displayedScale || 1),
      y:
        params.documentSize.height / 2 +
        (point.y - params.viewportSize.height / 2 - metrics.boundedPanY) / (metrics.displayedScale || 1),
    };
  }

  function clientPointToViewportPoint(clientPoint: Point2D, viewportRect: Pick<DOMRect, "left" | "top">): Point2D {
    return {
      x: clientPoint.x - viewportRect.left,
      y: clientPoint.y - viewportRect.top,
    };
  }

  function clientPointToDocumentPoint(clientPoint: Point2D, viewportRect: Pick<DOMRect, "left" | "top">): Point2D {
    return viewportPointToDocumentPoint(clientPointToViewportPoint(clientPoint, viewportRect));
  }

  function documentDistanceToViewportDistance(distance: number): number {
    return distance * metrics.displayedScale;
  }

  function viewportDistanceToDocumentDistance(distance: number): number {
    return distance / (metrics.displayedScale || 1);
  }

  function normalizedPointToViewportPoint(point: NormalizedPoint): Point2D {
    return documentPointToViewportPoint(normalizedPointToDocumentPoint(point));
  }

  function clampPan(pan: Point2D): Point2D {
    return clampPanToStage(pan, metrics);
  }

  function getFocalZoomPan(zoomParams: {
    pointer: Point2D;
    currentPan: Point2D;
    currentTransientZoom: number;
    nextTransientZoom: number;
  }): Point2D {
    return clampPan(
      applyFocalPointZoom({
        pointer: zoomParams.pointer,
        currentPan: zoomParams.currentPan,
        currentTransientZoom: zoomParams.currentTransientZoom,
        nextTransientZoom: zoomParams.nextTransientZoom,
      })
    );
  }

  return {
    rawPdfSize,
    documentSize: params.documentSize,
    viewportSize: params.viewportSize,
    rotation,
    viewportOrigin,
    pan: {
      x: metrics.boundedPanX,
      y: metrics.boundedPanY,
    },
    metrics,
    pdfPointToDocumentPoint,
    documentPointToPdfPoint,
    normalizedPointToDocumentPoint,
    documentPointToNormalizedPoint,
    documentPointToCommittedStagePoint,
    committedStagePointToDocumentPoint,
    documentPointToViewportPoint,
    viewportPointToDocumentPoint,
    documentDistanceToViewportDistance,
    viewportDistanceToDocumentDistance,
    clientPointToViewportPoint,
    clientPointToDocumentPoint,
    normalizedPointToViewportPoint,
    clampPan,
    getFocalZoomPan,
  };
}
