import { describe, expect, it } from "vitest";
import {
  PendingTakeoffMeasurementRegistry,
  hasTakeoffPageMutationAdvanced,
  isTemporaryTakeoffMeasurementId,
  resolveTakeoffMeasurementStatusTransition,
} from "./measurement-lifecycle";

describe("pending takeoff measurement lifecycle", () => {
  it.each(["line", "area", "count"] as const)("preserves cancellation when a %s create resolves", (measurementKind) => {
    const registry = new PendingTakeoffMeasurementRegistry();
    registry.register({ tempId: `temp-${measurementKind}`, measurementKind, pageId: "page-1" });
    registry.cancel(`temp-${measurementKind}`);
    const resolved = registry.resolve(`temp-${measurementKind}`, `real-${measurementKind}`);

    expect(resolved).toMatchObject({ state: "cancelled", resolvedId: `real-${measurementKind}` });
  });

  it("recognizes temporary IDs before persisted mutations", () => {
    expect(isTemporaryTakeoffMeasurementId("temp-123")).toBe(true);
    expect(isTemporaryTakeoffMeasurementId("8c95d8e4-8ea4-4bc1-9132-f4a35d61afde")).toBe(false);
  });

  it("detects a stale page response after a mutation revision advances", () => {
    expect(hasTakeoffPageMutationAdvanced(4, 5)).toBe(true);
    expect(hasTakeoffPageMutationAdvanced(5, 5)).toBe(false);
  });

  it.each([
    ["deleted", "delete", "deleted"],
    ["archived", "archive", "archived"],
    ["active", "restore", "active"],
  ] as const)("makes redundant %s -> %s status operations idempotent", (currentStatus, action, expectedStatus) => {
    expect(resolveTakeoffMeasurementStatusTransition(currentStatus, action)).toEqual({
      nextStatus: expectedStatus,
      shouldMutate: false,
    });
  });

  it("permits one effective status transition", () => {
    expect(resolveTakeoffMeasurementStatusTransition("active", "delete")).toEqual({
      nextStatus: "deleted",
      shouldMutate: true,
    });
  });
});
