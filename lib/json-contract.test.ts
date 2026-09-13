import { describe, expect, it } from "vitest";
import { assertJsonValue } from "./json-contract";

describe("JSON persistence contract", () => {
  it.each([null, true, false, 0, 1.5, "", "value", [], {}, { nested: [{ value: null }, 2, true], omitted: undefined }])("preserves valid JSON %j", (value) => {
    const before = JSON.stringify(value);
    expect(() => assertJsonValue(value)).not.toThrow();
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each([undefined, NaN, Infinity, () => 1, Symbol("test"), new Date(), [undefined], { callback: () => 1 }, { nested: [NaN] }])("rejects non-JSON input without leaking values", (value) => {
    expect(() => assertJsonValue(value)).toThrow("Persistence payload must contain only JSON values.");
  });
  it("rejects cycles and allows shared non-cyclic objects", () => {
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    expect(() => assertJsonValue(cyclic)).toThrow(TypeError);
    const shared = { x: 1 }; expect(() => assertJsonValue([shared, shared])).not.toThrow();
  });
});
