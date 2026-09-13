import { describe, expect, it } from "vitest";
import {
  mergeDrawingSetSummaryWithLocalMeasurements,
  reconcileTakeoffDrawingSetSummaryMeasurement,
  sortTakeoffDrawingSetSummaryMeasurements,
  type TakeoffDrawingSetSummaryMeasurement,
} from "@/lib/takeoff/measurement-summary";

function measurement(
  id: string,
  pageNumber: number,
  overrides: Partial<TakeoffDrawingSetSummaryMeasurement> = {},
): TakeoffDrawingSetSummaryMeasurement {
  return {
    id,
    pageId: `page-${pageNumber}`,
    pageNumber,
    pageLabel: `Page ${pageNumber}`,
    name: id,
    measurementKind: "line",
    colorHex: "#F15A29",
    displayValue: 1,
    displayUnit: "m",
    status: "active",
    createdAt: `2026-01-0${pageNumber}T00:00:00.000Z`,
    ...overrides,
  };
}

describe("drawing-set Takeoff measurement Summary", () => {
  it("keeps individual measurements from every page in deterministic page order", () => {
    const result = sortTakeoffDrawingSetSummaryMeasurements([
      measurement("measurement-b", 2),
      measurement("measurement-a", 1),
    ]);

    expect(result.map((row) => [row.id, row.pageId])).toEqual([
      ["measurement-a", "page-1"],
      ["measurement-b", "page-2"],
    ]);
  });

  it("adds, updates, and removes parent rows without grouping or touching other pages", () => {
    const first = measurement("measurement-a", 1);
    const second = measurement("measurement-b", 2);
    const third = measurement("measurement-c", 3, { measurementKind: "count", displayValue: 3, displayUnit: null });

    const created = reconcileTakeoffDrawingSetSummaryMeasurement([first, second], third);
    expect(created.map((row) => row.id)).toEqual(["measurement-a", "measurement-b", "measurement-c"]);

    const updated = reconcileTakeoffDrawingSetSummaryMeasurement(created, {
      ...first,
      displayValue: 2.5,
    });
    expect(updated.find((row) => row.id === first.id)).toMatchObject({ displayValue: 2.5 });

    const deleted = reconcileTakeoffDrawingSetSummaryMeasurement(updated, {
      ...second,
      status: "deleted",
    });
    expect(deleted.map((row) => row.id)).toEqual(["measurement-a", "measurement-c"]);
  });

  it("removes archived rows from the operational Summary", () => {
    const active = measurement("measurement-a", 1);
    const result = reconcileTakeoffDrawingSetSummaryMeasurement([active], {
      ...active,
      status: "archived",
    });

    expect(result).toEqual([]);
  });

  it("preserves off-page rows while appending a current-page optimistic measurement", () => {
    const result = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [
        measurement("measurement-a", 3),
        measurement("measurement-b", 7),
        measurement("measurement-c", 8),
      ],
      localMeasurements: [
        {
          id: "measurement-c",
          measurement_kind: "line",
          status: "active",
          name: "Current persisted",
          color_hex: "#F15A29",
          display_value: 12.15,
          display_unit: "m",
        },
        {
          id: "temp-123",
          measurement_kind: "area",
          status: "active",
          name: "New Area",
          color_hex: "#2563EB",
          display_value: 18.4,
          display_unit: "m²",
        },
      ],
      activePage: { id: "page-8", number: 8, label: "Page 8" },
    });

    expect(result.map((row) => row.id)).toEqual([
      "measurement-a",
      "measurement-b",
      "measurement-c",
      "temp-123",
    ]);
    expect(result.at(-1)).toMatchObject({
      pageId: "page-8",
      pageNumber: 8,
      pageLabel: "Page 8",
      name: "New Area",
    });
  });

  it("uses local current-page fields as the optimistic display authority", () => {
    const persisted = measurement("measurement-a", 8, {
      name: "Wall Type 1",
      displayValue: 12.15,
      displayUnit: "m",
    });
    const result = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [persisted],
      localMeasurements: [{
        id: persisted.id,
        measurement_kind: "area",
        status: "active",
        name: "Internal Wall",
        color_hex: "#0F766E",
        display_value: 13.8,
        display_unit: "m²",
      }],
      activePage: { id: "page-8", number: 8, label: "Page 8" },
    });

    expect(result).toEqual([{
      ...persisted,
      name: "Internal Wall",
      measurementKind: "area",
      colorHex: "#0F766E",
      displayValue: 13.8,
      displayUnit: "m²",
    }]);
  });

  it("restores optimistic rename and geometry values when local rollback restores the snapshot", () => {
    const persisted = measurement("measurement-a", 8, {
      name: "Wall Type 1",
      displayValue: 12.15,
    });
    const activePage = { id: "page-8", number: 8, label: "Page 8" };
    const optimistic = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [persisted],
      localMeasurements: [{
        id: persisted.id,
        measurement_kind: "line",
        status: "active",
        name: "Internal Wall",
        color_hex: persisted.colorHex,
        display_value: 13.8,
        display_unit: persisted.displayUnit,
      }],
      activePage,
    });
    const rolledBack = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [persisted],
      localMeasurements: [{
        id: persisted.id,
        measurement_kind: "line",
        status: "active",
        name: persisted.name,
        color_hex: persisted.colorHex,
        display_value: persisted.displayValue,
        display_unit: persisted.displayUnit,
      }],
      activePage,
    });

    expect(optimistic[0]).toMatchObject({ name: "Internal Wall", displayValue: 13.8 });
    expect(rolledBack[0]).toMatchObject({ name: "Wall Type 1", displayValue: 12.15 });
  });

  it("removes local deleted or archived rows and restores the persisted value on rollback", () => {
    const persisted = measurement("measurement-a", 8, { displayValue: 12.15 });
    const localMeasurement = {
      id: persisted.id,
      measurement_kind: "line" as const,
      status: "deleted",
      name: persisted.name,
      color_hex: persisted.colorHex,
      display_value: 13.8,
      display_unit: persisted.displayUnit,
    };
    const activePage = { id: "page-8", number: 8, label: "Page 8" };

    expect(mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [persisted],
      localMeasurements: [localMeasurement],
      activePage,
    })).toEqual([]);
    expect(mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [persisted],
      localMeasurements: [{ ...localMeasurement, status: "active", display_value: 12.15 }],
      activePage,
    })).toEqual([persisted]);
  });

  it("reconciles temporary and authoritative IDs without retaining geometry", () => {
    const activePage = { id: "page-8", number: 8, label: "Page 8" };
    const localMeasurementWithGeometry = {
      id: "temp-123",
      measurement_kind: "count" as const,
      status: "active",
      name: "New Count",
      color_hex: null,
      display_value: 3,
      display_unit: "count",
      points: [{ x: 0.5, y: 0.5 }],
    };
    const temporary = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [],
      localMeasurements: [localMeasurementWithGeometry],
      activePage,
    });
    const authoritative = measurement("real-456", 8, {
      name: "New Count",
      measurementKind: "count",
      displayValue: 3,
      displayUnit: "count",
    });
    const reconciled = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [authoritative],
      localMeasurements: [{
        id: authoritative.id,
        measurement_kind: "count",
        status: "active",
        name: authoritative.name,
        color_hex: authoritative.colorHex,
        display_value: authoritative.displayValue,
        display_unit: authoritative.displayUnit,
      }],
      activePage,
    });

    expect(temporary.map((row) => row.id)).toEqual(["temp-123"]);
    expect(reconciled.map((row) => row.id)).toEqual(["real-456"]);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).not.toHaveProperty("points");
    expect(reconciled[0]).not.toHaveProperty("line_paths");
    expect(reconciled[0]).not.toHaveProperty("area_shapes");
  });

  it("removes a failed temporary create when the existing lifecycle removes it locally", () => {
    const activePage = { id: "page-8", number: 8, label: "Page 8" };
    const pending = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [],
      localMeasurements: [{
        id: "temp-failed",
        measurement_kind: "area",
        status: "active",
        name: "Pending area",
        color_hex: null,
        display_value: 10,
        display_unit: "m²",
      }],
      activePage,
    });
    const failed = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [],
      localMeasurements: [],
      activePage,
    });

    expect(pending.map((row) => row.id)).toEqual(["temp-failed"]);
    expect(failed).toEqual([]);
  });

  it("keeps temporary ordering stable after persisted rows on the same page", () => {
    const result = mergeDrawingSetSummaryWithLocalMeasurements({
      summaryMeasurements: [measurement("persisted", 8)],
      localMeasurements: [
        {
          id: "temp-second",
          measurement_kind: "count",
          status: "active",
          name: "Second",
          color_hex: null,
          display_value: 1,
          display_unit: "count",
        },
        {
          id: "temp-third",
          measurement_kind: "count",
          status: "active",
          name: "Third",
          color_hex: null,
          display_value: 1,
          display_unit: "count",
        },
      ],
      activePage: { id: "page-8", number: 8, label: "Page 8" },
    });

    expect(result.map((row) => row.id)).toEqual(["persisted", "temp-second", "temp-third"]);
  });
});
