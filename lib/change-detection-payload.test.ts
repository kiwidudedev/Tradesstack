import { describe, expect, expectTypeOf, it } from "vitest";
import { toChangeDetectionPayload, type ChangeDetectionResponsePayload } from "./change-detection-payload";
import type { Database, Json } from "./supabase/types";

describe("change detection persistence contract", () => {
  it("has a concrete JSON-safe result and update contract", () => {
    expectTypeOf<ChangeDetectionResponsePayload>().toExtend<Json>();
    expectTypeOf<{ result_json: ChangeDetectionResponsePayload }>().toExtend<Database["public"]["Tables"]["change_detection_runs"]["Update"]>();
  });
  it("preserves the exact normalized payload and fills missing optional sections", () => {
    const result = toChangeDetectionPayload({ tradeLabel: " Plumbing ", revisionSummary: "Pipe — Rerouted", addedScope: [{ title: " Valve ", description: " Added " }] });
    expect(result).toEqual({ tradeLabel: "Plumbing", revisionSummary: [{ title: "Pipe", description: "Rerouted" }], addedScope: [{ title: "Valve", description: "Added" }], removedScope: [], modifiedScope: [], quantityOrSizeChanges: [], coordinationChanges: [], costImpactChanges: [], risksClarifications: [] });
  });
  it.each([null, undefined, "text", 1, true, [], {}, { tradeLabel: null }])("rejects an invalid root %j", (input) => {
    expect(toChangeDetectionPayload(input)).toBeNull();
  });
  it("drops non-contract nested values without serializing them into persistence", () => {
    const result = toChangeDetectionPayload({ tradeLabel: "Electrical", addedScope: [null, undefined, 2, true, () => 1, new Date(), { title: "x", description: new Date() }, { title: "Valid", description: "Retained", ignored: { callback: () => 1, nested: [null, 1] } }], removedScope: null });
    expect(result?.addedScope).toEqual([{ title: "Valid", description: "Retained" }]);
    expect(result?.removedScope).toEqual([]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
