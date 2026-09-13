import { describe, expect, it } from "vitest";
import { validateTakeoffPdfPreparationBounds } from "./page-preparation";

describe("validateTakeoffPdfPreparationBounds", () => {
  it("accepts a PDF inside both limits", () => {
    expect(() => validateTakeoffPdfPreparationBounds({
      byteLength: 1024,
      pageCount: 20,
      maxBytes: 2048,
      maxPages: 25,
    })).not.toThrow();
  });

  it("rejects an oversized PDF before parsing", () => {
    expect(() => validateTakeoffPdfPreparationBounds({
      byteLength: 2049,
      maxBytes: 2048,
      maxPages: 25,
    })).toThrow(/exceeds/i);
  });

  it("rejects a pathological page count", () => {
    expect(() => validateTakeoffPdfPreparationBounds({
      byteLength: 1024,
      pageCount: 26,
      maxBytes: 2048,
      maxPages: 25,
    })).toThrow(/25-page/i);
  });
});
