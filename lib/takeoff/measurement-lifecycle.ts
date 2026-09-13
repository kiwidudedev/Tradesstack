export type PendingTakeoffMeasurementState = "creating" | "cancelled" | "persisted" | "failed";

export interface PendingTakeoffMeasurement {
  tempId: string;
  state: PendingTakeoffMeasurementState;
  measurementKind: "line" | "area" | "count";
  pageId: string;
  resolvedId: string | null;
}

export function isTemporaryTakeoffMeasurementId(measurementId: string) {
  return measurementId.startsWith("temp-");
}

export function hasTakeoffPageMutationAdvanced(startRevision: number, currentRevision: number) {
  return currentRevision !== startRevision;
}

export function resolveTakeoffMeasurementStatusTransition(
  currentStatus: string,
  action: "archive" | "delete" | "restore",
) {
  const nextStatus: "archived" | "deleted" | "active" =
    action === "archive" ? "archived" : action === "delete" ? "deleted" : "active";
  return { nextStatus, shouldMutate: currentStatus !== nextStatus };
}

export class PendingTakeoffMeasurementRegistry {
  private readonly entries = new Map<string, PendingTakeoffMeasurement>();

  register(entry: Omit<PendingTakeoffMeasurement, "state" | "resolvedId">) {
    const pending: PendingTakeoffMeasurement = { ...entry, state: "creating", resolvedId: null };
    this.entries.set(entry.tempId, pending);
    return pending;
  }

  get(tempId: string) {
    return this.entries.get(tempId) ?? null;
  }

  cancel(tempId: string) {
    const pending = this.entries.get(tempId);
    if (!pending) return null;
    pending.state = "cancelled";
    return pending;
  }

  resolve(tempId: string, resolvedId: string) {
    const pending = this.entries.get(tempId);
    if (!pending) return null;
    pending.resolvedId = resolvedId;
    if (pending.state !== "cancelled") pending.state = "persisted";
    return pending;
  }

  fail(tempId: string) {
    const pending = this.entries.get(tempId);
    if (!pending) return null;
    pending.state = "failed";
    return pending;
  }

  settle(tempId: string) {
    this.entries.delete(tempId);
  }
}
