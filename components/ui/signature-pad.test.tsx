// @vitest-environment jsdom

import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

const context = {
  fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "",
  fillRect: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
};
let resizeCallback: (() => void) | null = null;
let rect = { x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 200, width: 600, height: 200, toJSON: () => ({}) };

class TestResizeObserver {
  constructor(callback: () => void) { resizeCallback = callback; }
  observe() { resizeCallback?.(); }
  disconnect() {}
}

beforeEach(() => {
  resizeCallback = null;
  rect = { x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 200, width: 600, height: 200, toJSON: () => ({}) };
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => callback(new Blob(["png"], { type: "image/png" })));
});

describe("SignaturePad", () => {
  it("captures multiple pointer strokes, handles cancellation, preserves normalized ink on resize, exports PNG, and clears", async () => {
    const ref = createRef<SignaturePadHandle>();
    const validity = vi.fn();
    const view = render(<SignaturePad ref={ref} onValidityChange={validity} />);
    const canvas = view.getByTestId("signature-pad-canvas");
    expect((canvas as HTMLElement).style.touchAction).toBe("none");
    fireEvent.pointerDown(canvas, { pointerId: 7, isPrimary: true, button: 0, clientX: 60, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 7, isPrimary: true, clientX: 150, clientY: 50 });
    fireEvent.pointerMove(canvas, { pointerId: 7, isPrimary: true, clientX: 260, clientY: 140 });
    fireEvent.pointerMove(canvas, { pointerId: 7, isPrimary: true, clientX: 420, clientY: 60 });
    fireEvent.pointerUp(canvas, { pointerId: 7, isPrimary: true, clientX: 420, clientY: 60 });
    fireEvent.pointerDown(canvas, { pointerId: 8, isPrimary: true, button: 0, clientX: 120, clientY: 120 });
    fireEvent.pointerMove(canvas, { pointerId: 8, isPrimary: true, clientX: 200, clientY: 40 });
    fireEvent.pointerMove(canvas, { pointerId: 8, isPrimary: true, clientX: 300, clientY: 130 });
    fireEvent.pointerCancel(canvas, { pointerId: 8, isPrimary: true, clientX: 300, clientY: 130 });
    expect(validity).toHaveBeenLastCalledWith(true);
    expect(canvas.setPointerCapture).toHaveBeenCalledTimes(2);
    expect(canvas.releasePointerCapture).toHaveBeenCalledTimes(2);
    const artifact = await ref.current!.exportPng();
    expect(artifact.blob.type).toBe("image/png");
    expect(artifact.metadata).toMatchObject({ pixelWidth: 1200, pixelHeight: 400, devicePixelRatio: 2, strokeCount: 2, pointCount: 7 });
    rect = { x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 180, width: 300, height: 180, toJSON: () => ({}) };
    resizeCallback?.();
    const resized = await ref.current!.exportPng();
    expect(resized.metadata).toMatchObject({ logicalWidth: 300, logicalHeight: 180, pixelWidth: 600, pixelHeight: 360, strokeCount: 2, pointCount: 7 });
    ref.current!.clear();
    expect(validity).toHaveBeenLastCalledWith(false);
    await expect(ref.current!.exportPng()).rejects.toThrow("Draw a fuller signature");
  });
});
