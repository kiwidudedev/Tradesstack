import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createXeroActionTiming } from "@/lib/xero/action-performance";

function controlledClock() {
  let value = 0;
  return {
    clock: () => value,
    advance: (milliseconds: number) => {
      value += milliseconds;
    },
  };
}

describe("Xero action performance timing", () => {
  it("reports exact operation duration separately from action elapsed time", async () => {
    const events: Array<Record<string, unknown>> = [];
    const time = controlledClock();
    const timing = createXeroActionTiming(
      {
        domain: "payment_claim",
        action: "push",
        claimId: "claim-1",
      },
      { clock: time.clock, logger: (event) => events.push(event) },
    );

    time.advance(10);
    const result = await timing.measure("authorisation", async () => {
      time.advance(7);
      return { ok: true };
    });
    time.advance(13);
    timing.complete();

    expect(result).toEqual({ ok: true });
    expect(events[0]).toMatchObject({
      event: "operation_complete",
      stage: "authorisation",
      operationDurationMs: 7,
      actionElapsedMs: 17,
      startedAt: 10,
      completedAt: 17,
    });
    expect(events[1]).toMatchObject({
      event: "complete",
      stage: "action_complete",
      operationDurationMs: 30,
      actionElapsedMs: 30,
    });
    expect(events[0]).not.toHaveProperty("durationMs");
    expect(events[0]).not.toHaveProperty("totalDurationMs");
  });

  it("reports true parallel child durations and group wall time", async () => {
    const events: Array<Record<string, unknown>> = [];
    const time = controlledClock();
    const timing = createXeroActionTiming(
      {
        domain: "retention_claim",
        action: "panel_load",
        claimId: "claim-2",
      },
      { clock: time.clock, logger: (event) => events.push(event) },
    );
    const group = timing.startParallelGroup("panel_dependencies");
    let resolvePermissions!: () => void;
    let resolveFeatureGate!: () => void;
    const permissions = new Promise<void>((resolve) => {
      resolvePermissions = resolve;
    });
    const featureGate = new Promise<void>((resolve) => {
      resolveFeatureGate = resolve;
    });
    const children = Promise.all([
      group.measure("permissions", () => permissions),
      group.measure("feature_gate", () => featureGate),
    ]);
    time.advance(4);
    resolvePermissions();
    await permissions;
    await Promise.resolve();
    time.advance(2);
    resolveFeatureGate();
    await children;
    group.complete();

    expect(events).toEqual([
      expect.objectContaining({
        stage: "permissions",
        operationDurationMs: 4,
        parentStage: "panel_dependencies",
        parallelGroup: "panel_dependencies",
      }),
      expect.objectContaining({
        stage: "feature_gate",
        operationDurationMs: 6,
        parentStage: "panel_dependencies",
        parallelGroup: "panel_dependencies",
      }),
      expect.objectContaining({
        event: "parallel_group_complete",
        stage: "panel_dependencies",
        operationDurationMs: 6,
        batchDurationMs: 6,
        actionElapsedMs: 6,
      }),
    ]);
  });

  it("records failed operations and rethrows the original error", async () => {
    const logger = vi.fn();
    const failure = new Error("safe failure");
    const timing = createXeroActionTiming(
      {
        domain: "retention_claim",
        action: "refresh",
        claimId: "claim-2",
      },
      { clock: () => 1, logger },
    );

    await expect(
      timing.measure("identity_load", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({
      event: "failed",
      stage: "identity_load",
      operationDurationMs: 0,
      actionElapsedMs: 0,
    }));
  });
});
