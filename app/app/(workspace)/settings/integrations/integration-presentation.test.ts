import { describe, expect, it } from "vitest";
import {
  deriveDatasetSyncState,
  deriveXeroConnectionPresentation,
  latestSuccessfulSync,
} from "./integration-presentation";

function connectedInput(overrides?: Partial<{
  status: string;
  tenant_id: string | null;
  last_health_status: string | null;
  latestAttemptStatus: string | null;
}>) {
  return {
    connectionLoaded: true,
    connection: {
      status: overrides?.status ?? "connected",
      tenant_id: overrides?.tenant_id ?? "tenant-1",
      last_health_status: overrides?.last_health_status ?? "healthy",
    },
    latestAttemptStatus: overrides?.latestAttemptStatus ?? null,
  };
}

describe("Xero integration presentation state", () => {
  it("keeps Connected as the primary state after a completed reconnect", () => {
    expect(deriveXeroConnectionPresentation(connectedInput({ latestAttemptStatus: "completed" }))).toMatchObject({
      key: "connected",
      label: "Connected",
    });
  });

  it("does not let a failed reconnect hide a working connection", () => {
    expect(deriveXeroConnectionPresentation(connectedInput({ latestAttemptStatus: "failed" }))).toMatchObject({
      key: "connected",
      label: "Connected",
    });
  });

  it("surfaces degraded health without changing the underlying connected identity", () => {
    expect(deriveXeroConnectionPresentation(connectedInput({ last_health_status: "degraded" }))).toMatchObject({
      key: "connected_attention",
      label: "Connected — needs attention",
    });
  });

  it("makes tenant selection a required setup state", () => {
    expect(deriveXeroConnectionPresentation(connectedInput({ status: "awaiting_tenant_selection" }))).toMatchObject({
      key: "tenant_required",
      label: "Action required",
      managementOpen: true,
    });
  });

  it("distinguishes a failed query from a confirmed not-connected state", () => {
    const failedLoad = deriveXeroConnectionPresentation({ connectionLoaded: false, connection: null });
    const loadedEmpty = deriveXeroConnectionPresentation({ connectionLoaded: true, connection: null });
    expect(failedLoad.label).toBe("Status unavailable");
    expect(loadedEmpty.label).toBe("Not connected");
  });

  it("derives sync state from timestamps and the latest real job state", () => {
    const completedAt = "2026-08-20T10:00:00.000Z";
    expect(deriveDatasetSyncState({ jobKind: "import_accounts", lastSyncedAt: completedAt, jobs: [], loaded: true })).toBe("Synced");
    expect(deriveDatasetSyncState({
      jobKind: "import_accounts",
      lastSyncedAt: completedAt,
      jobs: [{ job_kind: "import_accounts", queue_state: "claimed", created_at: "2026-08-21T10:00:00.000Z" }],
      loaded: true,
    })).toBe("Syncing");
    expect(deriveDatasetSyncState({
      jobKind: "import_accounts",
      lastSyncedAt: completedAt,
      jobs: [{ job_kind: "import_accounts", queue_state: "dead_lettered", created_at: "2026-08-21T10:00:00.000Z" }],
      loaded: true,
    })).toBe("Failed");
    expect(deriveDatasetSyncState({ jobKind: "import_accounts", lastSyncedAt: null, jobs: null, loaded: false })).toBe("Unavailable");
  });

  it("uses the latest successful dataset timestamp", () => {
    expect(latestSuccessfulSync([
      "2026-08-20T10:00:00.000Z",
      "2026-08-22T10:00:00.000Z",
      null,
    ])).toBe("2026-08-22T10:00:00.000Z");
  });
});
