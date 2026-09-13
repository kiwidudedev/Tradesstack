import { describe, expect, it } from "vitest";
import { reconcileCommittedTakeoffMeasurement } from "@/lib/takeoff/measurement-cache";

interface TestMeasurement {
  id: string;
  status: string;
  name: string;
  version: number;
  points: Array<{ id: string; x: number; y: number }>;
  area_shapes: Array<{ id: string; points: Array<{ id: string; x: number; y: number }> }>;
  line_paths: Array<{ id: string; points: Array<{ id: string; x: number; y: number }> }>;
}

function fullMeasurement(): TestMeasurement {
  return {
    id: "measurement-pb",
    status: "active",
    name: "PB",
    version: 1,
    points: [{ id: "point-parent", x: 0.1, y: 0.2 }],
    area_shapes: [{
      id: "shape-pb",
      points: [{ id: "point-shape", x: 0.1, y: 0.2 }],
    }],
    line_paths: [{
      id: "path-pb",
      points: [{ id: "point-path", x: 0.1, y: 0.2 }],
    }],
  };
}

describe("Takeoff workspace committed-measurement reconciliation", () => {
  it("preserves cached child geometry when an authoritative parent omits geometry fields", () => {
    const existing = fullMeasurement();
    const reconciled = reconcileCommittedTakeoffMeasurement(existing, {
      id: existing.id,
      status: "active",
      name: "PB renamed",
      version: 2,
    });

    expect(reconciled).toMatchObject({ name: "PB renamed", version: 2 });
    expect(reconciled.points).toBe(existing.points);
    expect(reconciled.area_shapes).toBe(existing.area_shapes);
    expect(reconciled.line_paths).toBe(existing.line_paths);
  });

  it("uses incoming geometry when child arrays are explicitly supplied", () => {
    const existing = fullMeasurement();
    const nextPoints = [{ id: "point-next", x: 0.3, y: 0.4 }];
    const nextAreaShapes = [{
      id: "shape-next",
      points: [{ id: "shape-point-next", x: 0.3, y: 0.4 }],
    }];
    const nextLinePaths: TestMeasurement["line_paths"] = [];
    const reconciled = reconcileCommittedTakeoffMeasurement(existing, {
      ...existing,
      version: 2,
      points: nextPoints,
      area_shapes: nextAreaShapes,
      line_paths: nextLinePaths,
    });

    expect(reconciled.points).toBe(nextPoints);
    expect(reconciled.area_shapes).toBe(nextAreaShapes);
    expect(reconciled.line_paths).toBe(nextLinePaths);
  });

  it("does not preserve stale geometry for an explicit deleted response", () => {
    const existing = fullMeasurement();
    const reconciled = reconcileCommittedTakeoffMeasurement(existing, {
      ...existing,
      status: "deleted",
      version: 2,
      points: [],
      area_shapes: [],
      line_paths: [],
    });

    expect(reconciled.status).toBe("deleted");
    expect(reconciled.points).toEqual([]);
    expect(reconciled.area_shapes).toEqual([]);
    expect(reconciled.line_paths).toEqual([]);
  });

  it("clears cached geometry defensively when a deleted response omits child arrays", () => {
    const existing = fullMeasurement();
    const reconciled = reconcileCommittedTakeoffMeasurement(existing, {
      id: existing.id,
      status: "deleted",
      name: existing.name,
      version: 2,
    });

    expect(reconciled.points).toEqual([]);
    expect(reconciled.area_shapes).toEqual([]);
    expect(reconciled.line_paths).toEqual([]);
  });
});
