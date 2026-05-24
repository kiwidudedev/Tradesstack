import { describe, expect, it } from "vitest";
import {
  getColumnOffsets,
  getColumnVirtualizationWindow,
} from "./opportunity-pricing-worksheet-virtual-columns";

function buildColumns(widths: number[]) {
  return widths.map((width, index) => ({
    id: String(index),
    width,
  }));
}

describe("worksheet virtual columns", () => {
  it("builds column offsets for variable widths", () => {
    expect(getColumnOffsets(buildColumns([100, 140, 80, 200]))).toEqual([0, 100, 240, 320, 520]);
  });

  it("returns the leftmost visible window at scrollLeft 0", () => {
    const columns = buildColumns([100, 100, 100, 100, 100]);
    const offsets = getColumnOffsets(columns);

    const window = getColumnVirtualizationWindow(columns, offsets, 0, 220, 1);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(4);
    expect(window.leftSpacerWidth).toBe(0);
    expect(window.rightSpacerWidth).toBe(0);
    expect(window.visibleColumns.map((column) => column.id)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("returns a middle window with overscan applied", () => {
    const columns = buildColumns([120, 80, 160, 100, 140, 90]);
    const offsets = getColumnOffsets(columns);

    const window = getColumnVirtualizationWindow(columns, offsets, 205, 180, 1);

    expect(window.startIndex).toBe(1);
    expect(window.endIndex).toBe(5);
    expect(window.leftSpacerWidth).toBe(120);
    expect(window.rightSpacerWidth).toBe(0);
  });

  it("returns spacer widths for a far-right scroll position", () => {
    const columns = buildColumns([100, 100, 100, 100, 100, 100, 100]);
    const offsets = getColumnOffsets(columns);

    const window = getColumnVirtualizationWindow(columns, offsets, 410, 120, 0);

    expect(window.startIndex).toBe(4);
    expect(window.endIndex).toBe(6);
    expect(window.leftSpacerWidth).toBe(400);
    expect(window.rightSpacerWidth).toBe(0);
    expect(window.visibleColumns.map((column) => column.id)).toEqual(["4", "5", "6"]);
  });

  it("keeps overscan bounded at the sheet edges", () => {
    const columns = buildColumns([90, 90, 90]);
    const offsets = getColumnOffsets(columns);

    const window = getColumnVirtualizationWindow(columns, offsets, 0, 40, 4);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(2);
    expect(window.leftSpacerWidth).toBe(0);
    expect(window.rightSpacerWidth).toBe(0);
  });
});
