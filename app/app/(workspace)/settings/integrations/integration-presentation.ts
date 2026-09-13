export type XeroConnectionStatus =
  | "disconnected"
  | "pending_authorization"
  | "awaiting_tenant_selection"
  | "connected"
  | "attention_required"
  | "error";

export type XeroHealthStatus = "healthy" | "degraded" | "disconnected" | "error" | null;

export type XeroOAuthAttemptStatus =
  | "created"
  | "redirect_issued"
  | "callback_received"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

export type XeroConnectionPresentationInput = {
  connectionLoaded: boolean;
  connection: {
    status: string;
    tenant_id: string | null;
    last_health_status: string | null;
  } | null;
  latestAttemptStatus?: string | null;
};

export type XeroConnectionPresentation = {
  key:
    | "load_error"
    | "not_connected"
    | "disconnected"
    | "authorization_in_progress"
    | "authorization_interrupted"
    | "tenant_required"
    | "connected"
    | "connected_attention"
    | "attention_required";
  label: string;
  description: string;
  badgeStatus: "approved" | "pending" | "overdue" | "draft";
  managementOpen: boolean;
};

const ACTIVE_AUTHORIZATION_STATUSES = new Set(["created", "redirect_issued", "callback_received"]);

export function isAuthorizationInProgress(status: string | null | undefined) {
  return status ? ACTIVE_AUTHORIZATION_STATUSES.has(status) : false;
}

export function deriveXeroConnectionPresentation(
  input: XeroConnectionPresentationInput,
): XeroConnectionPresentation {
  if (!input.connectionLoaded) {
    return {
      key: "load_error",
      label: "Status unavailable",
      description: "TradesStack could not confirm the current Xero connection state.",
      badgeStatus: "overdue",
      managementOpen: false,
    };
  }

  if (!input.connection) {
    return {
      key: "not_connected",
      label: "Not connected",
      description: "Connect TradesStack to Xero to synchronise accounting data.",
      badgeStatus: "draft",
      managementOpen: false,
    };
  }

  if (input.connection.status === "disconnected") {
    return {
      key: "disconnected",
      label: "Disconnected",
      description: "Reconnect Xero to resume accounting synchronisation.",
      badgeStatus: "draft",
      managementOpen: false,
    };
  }

  if (input.connection.status === "pending_authorization") {
    if (isAuthorizationInProgress(input.latestAttemptStatus)) {
      return {
        key: "authorization_in_progress",
        label: "Authorization in progress",
        description: "Complete the Xero authorization process to continue setup.",
        badgeStatus: "pending",
        managementOpen: true,
      };
    }
    return {
      key: "authorization_interrupted",
      label: "Authorization interrupted",
      description: "The last authorization attempt did not finish. Start a new attempt to continue.",
      badgeStatus: "overdue",
      managementOpen: true,
    };
  }

  if (input.connection.status === "awaiting_tenant_selection") {
    return {
      key: "tenant_required",
      label: "Action required",
      description: "Choose the Xero organisation TradesStack should use.",
      badgeStatus: "pending",
      managementOpen: true,
    };
  }

  if (input.connection.status === "connected") {
    if (["degraded", "error"].includes(input.connection.last_health_status ?? "")) {
      return {
        key: "connected_attention",
        label: "Connected — needs attention",
        description: "The Xero connection is active, but its latest health check needs review.",
        badgeStatus: "pending",
        managementOpen: true,
      };
    }
    return {
      key: "connected",
      label: "Connected",
      description: "Xero is connected and ready for accounting synchronisation.",
      badgeStatus: "approved",
      managementOpen: false,
    };
  }

  return {
    key: "attention_required",
    label: input.connection.tenant_id ? "Connected — needs attention" : "Connection needs attention",
    description: "Reconnect Xero to restore reliable accounting synchronisation.",
    badgeStatus: "overdue",
    managementOpen: true,
  };
}

export type SyncJobPresentationInput = {
  job_kind: string;
  queue_state: string;
  created_at: string;
};

export type DatasetSyncState = "Synced" | "Syncing" | "Failed" | "Not yet synced" | "Unavailable";

export function deriveDatasetSyncState(params: {
  jobKind: string;
  lastSyncedAt: string | null;
  jobs: SyncJobPresentationInput[] | null;
  loaded: boolean;
}): DatasetSyncState {
  if (!params.loaded || params.jobs === null) return "Unavailable";

  const latestJob = params.jobs
    .filter((job) => job.job_kind === params.jobKind)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];

  if (latestJob && ["pending", "claimed", "retry_scheduled"].includes(latestJob.queue_state)) {
    return "Syncing";
  }
  if (latestJob?.queue_state === "dead_lettered") return "Failed";
  return params.lastSyncedAt ? "Synced" : "Not yet synced";
}

export function latestSuccessfulSync(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function formatOAuthAttemptStatus(status: string | null | undefined) {
  if (!status) return "No authorization attempts recorded";
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
