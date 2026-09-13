import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TAKEOFF_PANEL_SAFETY_MARGIN,
  clampTakeoffPanelOffset,
  type TakeoffPanelRect,
} from "./DraggableTakeoffPanel";

const boundary: TakeoffPanelRect = {
  left: 0,
  top: 0,
  right: 500,
  bottom: 400,
  width: 500,
  height: 400,
};
const anchor: TakeoffPanelRect = {
  left: 150,
  top: 200,
  right: 350,
  bottom: 300,
  width: 200,
  height: 100,
};

function clamp(x: number, y: number, nextBoundary = boundary) {
  return clampTakeoffPanelOffset({
    anchorRect: anchor,
    boundaryRect: nextBoundary,
    requestedOffset: { x, y },
  });
}

describe("clampTakeoffPanelOffset", () => {
  it("clamps the left edge to the safety margin", () => {
    expect(clamp(-1_000, 0).offset).toEqual({ x: -140, y: 0 });
  });

  it("clamps the right edge to the safety margin", () => {
    expect(clamp(1_000, 0).offset).toEqual({ x: 140, y: 0 });
  });

  it("clamps the top edge to the safety margin", () => {
    expect(clamp(0, -1_000).offset).toEqual({ x: 0, y: -190 });
  });

  it("clamps the bottom edge to the safety margin", () => {
    expect(clamp(0, 1_000).offset).toEqual({ x: 0, y: 90 });
  });

  it("keeps movement available in a small viewer when the panel still fits", () => {
    const smallBoundary = { left: 100, top: 150, right: 340, bottom: 310, width: 240, height: 160 };
    const result = clamp(50, 50, smallBoundary);

    expect(result.canMove).toBe(true);
    expect(result.offset).toEqual({ x: -20, y: 0 });
  });

  it("disables movement and preserves the default anchor when the panel is oversized", () => {
    const result = clampTakeoffPanelOffset({
      anchorRect: anchor,
      boundaryRect: {
        left: 0,
        top: 0,
        right: anchor.width + TAKEOFF_PANEL_SAFETY_MARGIN,
        bottom: anchor.height + TAKEOFF_PANEL_SAFETY_MARGIN,
        width: anchor.width + TAKEOFF_PANEL_SAFETY_MARGIN,
        height: anchor.height + TAKEOFF_PANEL_SAFETY_MARGIN,
      },
      requestedOffset: { x: 80, y: -40 },
    });

    expect(result).toEqual({ offset: { x: 0, y: 0 }, canMove: false });
  });

  it("re-clamps an existing offset after the boundary shrinks", () => {
    const initial = clamp(130, 80);
    const shrunkenBoundary = { left: 0, top: 0, right: 390, bottom: 330, width: 390, height: 330 };
    const reclamped = clamp(initial.offset.x, initial.offset.y, shrunkenBoundary);

    expect(initial.offset).toEqual({ x: 130, y: 80 });
    expect(reclamped.offset).toEqual({ x: 30, y: 20 });
  });
});

describe("DraggableTakeoffPanel interaction contract", () => {
  const panelSource = readFileSync(new URL("./DraggableTakeoffPanel.tsx", import.meta.url), "utf8");
  const dialogSource = readFileSync(new URL("./TakeoffMeasureToolDialog.tsx", import.meta.url), "utf8");
  const viewerSource = readFileSync(new URL("./TakeoffPdfViewer.tsx", import.meta.url), "utf8");

  it("uses pointer capture and handles pointer-up and pointer-cancel cleanup on the dedicated handle", () => {
    expect(panelSource).toContain("event.currentTarget.setPointerCapture(event.pointerId)");
    expect(panelSource).toContain("event.currentTarget.releasePointerCapture(event.pointerId)");
    expect(panelSource).toContain("onPointerMove={handlePointerMove}");
    expect(panelSource).toContain("onPointerUp={finishPointerDrag}");
    expect(panelSource).toContain("onPointerCancel={finishPointerDrag}");
    expect(panelSource).toContain("onLostPointerCapture={finishPointerDrag}");
    expect(panelSource).toContain('aria-label="Move setup dialog"');
    expect(panelSource).toContain("tabIndex={-1}");
  });

  it("binds drag start only to the handle so form inputs and actions remain interactive", () => {
    expect(panelSource.match(/onPointerDown=\{handlePointerDown\}/g)).toHaveLength(1);
    expect(dialogSource).toContain('id="measure-calibration-length"');
    expect(dialogSource).toContain('id="measure-calibration-unit"');
    expect(dialogSource).toContain('type="button" onClick={() => onOpenChange(false)}');
    expect(dialogSource).toContain('<form onSubmit={handleSubmit}>');
  });

  it("resets locally, re-clamps with ResizeObserver, and updates only a translate3d transform in animation frames", () => {
    expect(panelSource).toContain("new ResizeObserver(scheduleReclamp)");
    expect(panelSource).toContain("window.requestAnimationFrame");
    expect(panelSource).toContain("translate3d(${offset.x}px, ${offset.y}px, 0)");
    expect(panelSource).toContain("[reclampPanel, resetKey, resetOffset]");
    expect(viewerSource).toContain('resetKey={`${drawingSetId}:${pageId}:${activeSetupTool ?? "none"}`}');
    expect(viewerSource).not.toContain("setTakeoffPanelPosition");
  });

  it("keeps the overlay viewer-local and preserves non-modal dialog semantics", () => {
    expect(panelSource).toContain('className="pointer-events-none absolute inset-0 z-30"');
    expect(panelSource).toContain('role="dialog"');
    expect(panelSource).not.toContain("aria-modal");
    expect(dialogSource).toContain("<DraggableTakeoffPanel");
  });
});
