// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewQASignatureControl } from "./PreviewQASignatureControl";

const context = {
  fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "",
  fillRect: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { constructor(private callback: () => void) {} observe() { this.callback(); } disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 200, width: 600, height: 200, toJSON: () => ({}) });
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => callback(new Blob(["png"], { type: "image/png" })));
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:preview-signature"), revokeObjectURL: vi.fn() });
});

function draw(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, isPrimary: true, button: 0, clientX: 50, clientY: 150 });
  fireEvent.pointerMove(canvas, { pointerId: 1, isPrimary: true, clientX: 160, clientY: 45 });
  fireEvent.pointerMove(canvas, { pointerId: 1, isPrimary: true, clientX: 280, clientY: 140 });
  fireEvent.pointerMove(canvas, { pointerId: 1, isPrimary: true, clientX: 430, clientY: 55 });
  fireEvent.pointerUp(canvas, { pointerId: 1, isPrimary: true, clientX: 430, clientY: 55 });
}

describe("PreviewQASignatureControl", () => {
  it("draws, clears, and temporarily displays a saved signature", async () => {
    const view = render(<PreviewQASignatureControl />);
    fireEvent.change(view.getByLabelText("Signer name"), { target: { value: "John Smith" } });
    fireEvent.click(view.getByRole("checkbox"));
    const save = view.getByRole("button", { name: "Save signature" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    draw(view.getByTestId("signature-pad-canvas"));
    expect(save.disabled).toBe(false);
    fireEvent.click(view.getByRole("button", { name: "Clear" }));
    expect(save.disabled).toBe(true);
    draw(view.getByTestId("signature-pad-canvas"));
    fireEvent.click(save);
    expect(await view.findByText("Signed by John Smith")).toBeTruthy();
    expect(view.getByAltText("Signature captured for John Smith").getAttribute("src")).toBe("blob:preview-signature");
  });

  it("keeps the visible typed acknowledgement fallback ephemeral", () => {
    const first = render(<PreviewQASignatureControl />);
    fireEvent.click(first.getByRole("radio", { name: "Typed acknowledgement" }));
    expect(first.queryByTestId("signature-pad-canvas")).toBeNull();
    fireEvent.change(first.getByLabelText("Signer name"), { target: { value: "Alex Builder" } });
    fireEvent.click(first.getByRole("checkbox"));
    fireEvent.click(first.getByRole("button", { name: "Sign acknowledgement" }));
    expect(first.getByText(/Typed acknowledgement · Preview only/)).toBeTruthy();
    first.unmount();
    const reopened = render(<PreviewQASignatureControl />);
    expect((reopened.getByLabelText("Signer name") as HTMLInputElement).value).toBe("");
    expect(reopened.getByTestId("signature-pad-canvas")).toBeTruthy();
  });
});
