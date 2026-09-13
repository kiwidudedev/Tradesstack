import { createClient } from "@supabase/supabase-js";

const REPAIR_VERSION = "takeoff-calibration-unit-integrity-v1";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function distancePts(points, page) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    total += Math.hypot(
      (current.x - previous.x) * Number(page.page_width_pts),
      (current.y - previous.y) * Number(page.page_height_pts)
    );
  }
  return total;
}

function polygonMetrics(points, page) {
  if (points.length < 3) throw new Error("Area geometry has fewer than three points.");
  let twiceArea = 0;
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentX = current.x * Number(page.page_width_pts);
    const currentY = current.y * Number(page.page_height_pts);
    const nextX = next.x * Number(page.page_width_pts);
    const nextY = next.y * Number(page.page_height_pts);
    twiceArea += currentX * nextY - nextX * currentY;
    perimeter += Math.hypot(nextX - currentX, nextY - currentY);
  }
  return { areaPts: Math.abs(twiceArea) / 2, perimeterPts: perimeter };
}

function unitDefinition(displayUnit) {
  const definitions = {
    mm: { system: "metric", base: "mm", factor: 1 },
    cm: { system: "metric", base: "mm", factor: 10 },
    m: { system: "metric", base: "mm", factor: 1000 },
    in: { system: "imperial", base: "in", factor: 1 },
    ft: { system: "imperial", base: "in", factor: 12 },
  };
  const definition = definitions[displayUnit];
  if (!definition) throw new Error(`Unsupported intended unit: ${displayUnit}`);
  return definition;
}

async function selectOrThrow(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

async function buildCandidateReport(supabase, classifications) {
  const calibrations = await selectOrThrow(
    supabase
      .from("takeoff_calibrations")
      .select("id,organization_id,project_id,opportunity_id,page_id,created_at,created_by,reference_length_input,reference_length_base,display_unit,base_unit,unit_system,scale_ratio,is_active,point_a_x,point_a_y,point_b_x,point_b_y")
      .eq("display_unit", "mm")
      .eq("base_unit", "mm")
      .order("created_at", { ascending: true }),
    "Unable to load calibration candidates"
  );
  const pageIds = [...new Set(calibrations.map((row) => row.page_id))];
  const pages = pageIds.length
    ? await selectOrThrow(
        supabase.from("takeoff_pages").select("id,drawing_set_id,page_number,page_width_pts,page_height_pts").in("id", pageIds),
        "Unable to load candidate pages"
      )
    : [];
  const calibrationIds = calibrations.map((row) => row.id);
  const measurements = calibrationIds.length
    ? await selectOrThrow(
        supabase.from("takeoff_measurements").select("id,calibration_id,status").in("calibration_id", calibrationIds),
        "Unable to load candidate dependencies"
      )
    : [];
  const pageMap = new Map(pages.map((page) => [page.id, page]));

  const candidates = calibrations.map((calibration) => {
    const page = pageMap.get(calibration.page_id);
    const dependent = measurements.filter((measurement) => measurement.calibration_id === calibration.id);
    const referenceLinePdfPointLength = page
      ? distancePts(
          [
            { x: Number(calibration.point_a_x), y: Number(calibration.point_a_y) },
            { x: Number(calibration.point_b_x), y: Number(calibration.point_b_y) },
          ],
          page
        )
      : null;
    return {
      classification: classifications.get(calibration.id) ?? "REQUIRES REVIEW",
      calibrationId: calibration.id,
      organizationId: calibration.organization_id,
      projectId: calibration.project_id,
      opportunityId: calibration.opportunity_id,
      drawingSetId: page?.drawing_set_id ?? null,
      pageId: calibration.page_id,
      pageNumber: page?.page_number ?? null,
      createdAt: calibration.created_at,
      createdBy: calibration.created_by,
      referenceLengthInput: calibration.reference_length_input,
      referenceLengthBase: calibration.reference_length_base,
      displayUnit: calibration.display_unit,
      baseUnit: calibration.base_unit,
      scaleRatio: calibration.scale_ratio,
      active: calibration.is_active,
      dependentMeasurementCount: dependent.length,
      dependentActiveCount: dependent.filter((item) => item.status === "active").length,
      dependentDeletedCount: dependent.filter((item) => item.status === "deleted").length,
      pageWidthPts: page?.page_width_pts ?? null,
      pageHeightPts: page?.page_height_pts ?? null,
      referenceLinePdfPointLength,
      derivedPhysicalLengthCurrentBase: referenceLinePdfPointLength === null
        ? null
        : referenceLinePdfPointLength * Number(calibration.scale_ratio),
    };
  });
  const counts = candidates.reduce(
    (result, candidate) => {
      if (candidate.classification === "CONFIRMED AFFECTED") result.confirmedAffected += 1;
      else if (candidate.classification === "CONFIRMED LEGITIMATE") result.confirmedLegitimate += 1;
      else result.requiresReview += 1;
      return result;
    },
    { confirmedAffected: 0, confirmedLegitimate: 0, requiresReview: 0 }
  );
  return { generatedAt: new Date().toISOString(), counts, candidates };
}

async function buildRepairProposal(supabase, calibrationId, intendedDisplayUnit) {
  const calibrationResult = await supabase
    .from("takeoff_calibrations")
    .select("*")
    .eq("id", calibrationId)
    .maybeSingle();
  if (calibrationResult.error || !calibrationResult.data) throw new Error("Allowlisted calibration was not found.");
  const calibration = calibrationResult.data;
  const pageResult = await supabase.from("takeoff_pages").select("*").eq("id", calibration.page_id).single();
  if (pageResult.error) throw new Error(`Unable to load repair page: ${pageResult.error.message}`);
  const page = pageResult.data;
  const definition = unitDefinition(intendedDisplayUnit);
  if (definition.system !== calibration.unit_system || definition.base !== calibration.base_unit) {
    throw new Error("Intended unit does not match the calibration unit system and base unit.");
  }

  const calibrationDistancePts = distancePts([
    { x: Number(calibration.point_a_x), y: Number(calibration.point_a_y) },
    { x: Number(calibration.point_b_x), y: Number(calibration.point_b_y) },
  ], page);
  if (calibrationDistancePts <= 0) throw new Error("Calibration reference geometry is invalid.");
  const referenceLengthBase = Number(calibration.reference_length_input) * definition.factor;
  const scaleRatio = referenceLengthBase / calibrationDistancePts;
  const measurements = await selectOrThrow(
    supabase.from("takeoff_measurements").select("*").eq("calibration_id", calibrationId).order("id"),
    "Unable to load dependent measurements"
  );
  const measurementIds = measurements.map((row) => row.id);
  const points = measurementIds.length
    ? await selectOrThrow(supabase.from("takeoff_measurement_points").select("*").in("measurement_id", measurementIds).order("point_order"), "Unable to load points")
    : [];
  const shapes = measurementIds.length
    ? await selectOrThrow(supabase.from("takeoff_measurement_area_shapes").select("*").in("measurement_id", measurementIds).order("shape_order"), "Unable to load area shapes")
    : [];
  const shapeIds = shapes.map((row) => row.id);
  const shapePoints = shapeIds.length
    ? await selectOrThrow(supabase.from("takeoff_measurement_area_shape_points").select("*").in("area_shape_id", shapeIds).order("point_order"), "Unable to load area shape points")
    : [];
  const paths = measurementIds.length
    ? await selectOrThrow(supabase.from("takeoff_measurement_line_paths").select("*").in("measurement_id", measurementIds).order("path_order"), "Unable to load line paths")
    : [];
  const pathIds = paths.map((row) => row.id);
  const pathPoints = pathIds.length
    ? await selectOrThrow(supabase.from("takeoff_measurement_line_path_points").select("*").in("line_path_id", pathIds).order("point_order"), "Unable to load line path points")
    : [];

  const repairs = measurements.map((measurement) => {
    if (measurement.measurement_kind === "count") throw new Error("A count measurement unexpectedly references a calibration.");
    const measurementPoints = points.filter((point) => point.measurement_id === measurement.id);
    if (measurement.measurement_kind === "line") {
      const measurementPaths = paths.filter((path) => path.measurement_id === measurement.id);
      const linePaths = measurementPaths.map((path) => {
        const length = distancePts(pathPoints.filter((point) => point.line_path_id === path.id), page) * scaleRatio;
        return { id: path.id, measured_length_base: length };
      });
      const measuredLengthBase = linePaths.length
        ? linePaths.reduce((total, path) => total + path.measured_length_base, 0)
        : distancePts(measurementPoints, page) * scaleRatio;
      return {
        id: measurement.id,
        measured_length_base: measuredLengthBase,
        measured_area_base: null,
        measured_perimeter_base: null,
        display_value: measuredLengthBase / definition.factor,
        display_unit: intendedDisplayUnit,
        area_shapes: [],
        line_paths: linePaths,
      };
    }

    const measurementShapes = shapes.filter((shape) => shape.measurement_id === measurement.id);
    const areaShapes = (measurementShapes.length ? measurementShapes : [{ id: null }]).map((shape) => {
      const geometry = shape.id
        ? shapePoints.filter((point) => point.area_shape_id === shape.id)
        : measurementPoints;
      const metrics = polygonMetrics(geometry, page);
      return {
        id: shape.id,
        measured_area_base: metrics.areaPts * scaleRatio * scaleRatio,
        measured_perimeter_base: metrics.perimeterPts * scaleRatio,
      };
    });
    const roles = measurement.metadata?.areaShapeRoles ?? {};
    const measuredAreaBase = areaShapes.reduce(
      (total, shape) => total + (shape.id && roles[shape.id] === "deduction" ? -shape.measured_area_base : shape.measured_area_base),
      0
    );
    const measuredPerimeterBase = areaShapes.reduce((total, shape) => total + shape.measured_perimeter_base, 0);
    return {
      id: measurement.id,
      measured_length_base: null,
      measured_area_base: measuredAreaBase,
      measured_perimeter_base: measuredPerimeterBase,
      display_value: measuredAreaBase / (definition.factor * definition.factor),
      display_unit: `${intendedDisplayUnit}²`,
      area_shapes: areaShapes.filter((shape) => shape.id),
      line_paths: [],
    };
  });

  return {
    calibration,
    page,
    intendedDisplayUnit,
    referenceLengthBase,
    scaleRatio,
    repairs,
    dependencySummary: {
      total: measurements.length,
      active: measurements.filter((row) => row.status === "active").length,
      deleted: measurements.filter((row) => row.status === "deleted").length,
    },
  };
}

const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const classifications = new Map();
for (const entry of (option("--confirmed-affected") ?? "").split(",").filter(Boolean)) classifications.set(entry, "CONFIRMED AFFECTED");
for (const entry of (option("--confirmed-legitimate") ?? "").split(",").filter(Boolean)) classifications.set(entry, "CONFIRMED LEGITIMATE");

if (process.argv.includes("--report")) {
  console.log(JSON.stringify(await buildCandidateReport(supabase, classifications), null, 2));
  process.exit(0);
}

const calibrationId = option("--allowlist");
const intendedDisplayUnit = option("--intended-unit");
if (!calibrationId || calibrationId.includes(",") || !intendedDisplayUnit) {
  throw new Error("Repair requires exactly one --allowlist calibration ID and one --intended-unit.");
}
const proposal = await buildRepairProposal(supabase, calibrationId, intendedDisplayUnit);
const execute = process.argv.includes("--execute");
const reason = option("--reason") ?? "Confirmed calibration display unit reset repaired from source geometry.";
const rpcResult = await supabase.rpc("repair_takeoff_calibration_unit_integrity", {
  arg_calibration_id: calibrationId,
  arg_expected_updated_at: proposal.calibration.updated_at,
  arg_intended_display_unit: intendedDisplayUnit,
  arg_reference_length_base: proposal.referenceLengthBase,
  arg_scale_ratio: proposal.scaleRatio,
  arg_measurement_repairs: proposal.repairs,
  arg_reason: reason,
  arg_repair_version: REPAIR_VERSION,
  arg_dry_run: !execute,
});
if (rpcResult.error) throw new Error(rpcResult.error.message);
console.log(JSON.stringify({ mode: execute ? "EXECUTE" : "DRY RUN", proposal, transactionResult: rpcResult.data }, null, 2));
