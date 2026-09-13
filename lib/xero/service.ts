import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getXeroEnv } from "@/lib/xero/env";
import { createRandomXeroState, decryptJsonValue, encryptJsonValue, hashXeroOAuthState } from "@/lib/xero/crypto";
import {
  buildXeroAuthorizeUrl,
  disconnectXeroTenant,
  exchangeXeroAuthorizationCode,
  listXeroConnections,
  refreshXeroToken,
  XeroRequestError,
} from "@/lib/xero/client";
import type { StoredXeroTenant, XeroConnection, XeroTokenSet } from "@/lib/xero/types";

const SETTINGS_PATH = "/app/settings/integrations";
const XERO_OAUTH_STATE_EXPIRY_MINUTES = 10;

type OrganizationXeroConnectionRow = {
  id: string;
  organization_id: string;
  status:
    | "disconnected"
    | "pending_authorization"
    | "awaiting_tenant_selection"
    | "connected"
    | "attention_required"
    | "error";
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_type: string | null;
  tenant_connection_id: string | null;
  xero_user_id: string | null;
  scope: string[] | null;
  available_tenants_json: StoredXeroTenant[];
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  last_health_status: "healthy" | "degraded" | "disconnected" | "error" | null;
  last_health_checked_at: string | null;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_accounts_sync_at: string | null;
  last_tax_rates_sync_at: string | null;
  last_contacts_sync_at: string | null;
  last_error: string | null;
  connected_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type OrganizationXeroConnectionSecretRow = {
  connection_id: string;
  encrypted_token_set: string;
  encryption_version: number;
  created_at: string;
  updated_at: string;
};

type XeroMutationResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type OrganizationXeroOauthStateRow = {
  id: string;
  organization_id: string;
  user_id: string;
  connection_id: string | null;
  correlation_id: string | null;
  state_hash: string;
  redirect_path: string;
  expires_at: string;
  used_at: string | null;
  status:
    | "created"
    | "redirect_issued"
    | "callback_received"
    | "completed"
    | "expired"
    | "cancelled"
    | "failed"
    | null;
  redirect_issued_at: string | null;
  callback_received_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  failure_at: string | null;
  callback_outcome: string | null;
  created_at: string;
  updated_at: string | null;
};

export type XeroOAuthAttemptStatus = NonNullable<OrganizationXeroOauthStateRow["status"]>;

export type XeroOAuthAttemptSummary = Pick<
  OrganizationXeroOauthStateRow,
  | "id"
  | "connection_id"
  | "correlation_id"
  | "status"
  | "created_at"
  | "expires_at"
  | "redirect_issued_at"
  | "callback_received_at"
  | "completed_at"
  | "failure_code"
  | "failure_at"
  | "callback_outcome"
>;

const ACTIVE_OAUTH_ATTEMPT_STATUSES: XeroOAuthAttemptStatus[] = [
  "created",
  "redirect_issued",
  "callback_received",
];

const SAFE_XERO_ERROR_MESSAGES: Record<string, string> = {
  xero_connect_not_authorized: "You do not have permission to connect Xero.",
  xero_connect_configuration_error: "Xero connection settings need administrator attention before authorization can start.",
  xero_connect_state_creation_failed: "TradesStack could not start a durable Xero authorization attempt. Try again or contact support.",
  xero_connect_connection_update_failed: "TradesStack recorded the attempt but could not prepare the Xero connection. Try again or contact support.",
  xero_connect_redirect_failed: "TradesStack could not open Xero authorization. Try again or contact support.",
  xero_callback_access_denied: "Xero authorization was cancelled or denied. You can safely try again.",
  xero_callback_missing_parameters: "Xero did not return the information required to complete authorization.",
  xero_callback_session_missing: "Sign in again before completing the Xero connection.",
  xero_callback_state_invalid: "This Xero authorization attempt is invalid or has already finished. Start a new reconnect attempt.",
  xero_callback_state_expired: "This Xero authorization attempt expired. Start a new reconnect attempt.",
  xero_callback_state_superseded: "A newer Xero authorization attempt has replaced this one.",
  xero_callback_wrong_user: "This Xero authorization attempt belongs to another signed-in user.",
  xero_callback_membership_invalid: "Your organization access changed before Xero authorization completed.",
  xero_callback_token_exchange_failed: "Xero authorization could not be exchanged securely. Start a new reconnect attempt.",
  xero_callback_tenant_discovery_failed: "TradesStack could not confirm the authorized Xero organization.",
  xero_callback_no_tenants: "Xero returned no organizations for this authorization.",
  xero_callback_token_encryption_failed: "TradesStack could not secure the refreshed Xero credentials.",
  xero_callback_persistence_failed: "TradesStack could not commit the Xero connection safely. No successful reconnect was recorded.",
};

export function getSafeXeroRecoveryMessage(code: string | null | undefined) {
  return code ? SAFE_XERO_ERROR_MESSAGES[code] ?? "The Xero reconnect attempt did not complete. Try again or contact support." : null;
}

const SAFE_LEGACY_INTEGRATION_ERRORS = new Set([
  "You do not have permission to manage integrations.",
  "Select a Xero tenant first.",
  "Unable to select the Xero tenant.",
  "Connect Xero before refreshing reference data.",
  "Unable to refresh Xero reference data.",
  "Connect Xero before refreshing contacts.",
  "Unable to refresh Xero contacts.",
  "Confirm the Xero disconnect before continuing.",
  "Unable to disconnect Xero.",
  "Select an accounting workflow and Xero account.",
  "Select an active account from the connected Xero tenant.",
  "The selected Xero account has the wrong classification for this workflow.",
  "Unable to save the accounting workflow mapping.",
]);

export function getSafeLegacyIntegrationError(message: string | null | undefined) {
  if (!message) return null;
  return SAFE_LEGACY_INTEGRATION_ERRORS.has(message)
    ? message
    : "Unable to complete the Xero integration action. Try again or contact support.";
}

export class XeroOAuthFlowError extends Error {
  readonly code: string;
  readonly correlationId: string;

  constructor(code: string, correlationId: string, message?: string) {
    super(message ?? getSafeXeroRecoveryMessage(code) ?? "Xero authorization failed.");
    this.name = "XeroOAuthFlowError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

function decodeJwtPayload(token: string | undefined) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeTokenSet(tokenSet: XeroTokenSet, previousRefreshToken?: string | null): XeroTokenSet {
  return {
    ...tokenSet,
    refresh_token: tokenSet.refresh_token || previousRefreshToken || "",
    scope: Array.isArray(tokenSet.scope)
      ? tokenSet.scope
      : typeof tokenSet.scope === "string"
        ? tokenSet.scope.split(/\s+/).filter(Boolean)
        : [],
  };
}

function addSecondsToIso(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) {
    return null;
  }
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

function inferRefreshExpiryIso() {
  return new Date(Date.now() + 60 * 24 * 60 * 60 * 1_000).toISOString();
}

function toStoredTenant(connection: XeroConnection): StoredXeroTenant {
  return {
    connectionId: connection.id,
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
    tenantType: connection.tenantType,
    createdDateUtc: connection.createdDateUtc ?? null,
    updatedDateUtc: connection.updatedDateUtc ?? null,
  };
}

async function getAdmin() {
  return await createAdminSupabaseClient();
}

async function markOauthAttemptFailed(params: {
  attemptId: string;
  code: string;
  message?: string | null;
  callbackOutcome?: string | null;
}) {
  const admin = await getAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("organization_xero_oauth_states" as never)
    .update({
      status: "failed",
      failure_code: params.code,
      failure_message: params.message ?? getSafeXeroRecoveryMessage(params.code),
      failure_at: nowIso,
      callback_outcome: params.callbackOutcome ?? "failed",
      used_at: nowIso,
      updated_at: nowIso,
    } as never)
    .eq("id", params.attemptId)
    .in("status", ACTIVE_OAUTH_ATTEMPT_STATUSES as never);

  if (error) throw new Error(error.message);
}

async function reconcileConnectionAfterAttemptEnd(params: {
  organizationId: string;
  connectionId: string | null;
}) {
  if (!params.connectionId) return;
  const admin = await getAdmin();
  const nowIso = new Date().toISOString();
  const active = await admin
    .from("organization_xero_oauth_states" as never)
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("connection_id", params.connectionId)
    .in("status", ACTIVE_OAUTH_ATTEMPT_STATUSES as never)
    .gt("expires_at", nowIso)
    .limit(1);

  if (active.error) throw new Error(active.error.message);
  if ((active.data ?? []).length > 0) return;

  const connectionUpdate = await admin
    .from("organization_xero_connections" as never)
    .update({
      status: "attention_required",
      updated_at: nowIso,
    } as never)
    .eq("id", params.connectionId)
    .eq("organization_id", params.organizationId)
    .eq("status", "pending_authorization");

  if (connectionUpdate.error) throw new Error(connectionUpdate.error.message);
}

export async function reconcileExpiredXeroOAuthAttempts(params?: {
  organizationId?: string;
}) {
  const admin = await getAdmin();
  const nowIso = new Date().toISOString();
  let query = admin
    .from("organization_xero_oauth_states" as never)
    .select("id, organization_id, connection_id, correlation_id, status, created_at, expires_at, redirect_issued_at, callback_received_at, completed_at, failure_code, failure_at, callback_outcome")
    .is("used_at", null)
    .lt("expires_at", nowIso)
    .or("status.is.null,status.in.(created,redirect_issued,callback_received)");
  if (params?.organizationId) query = query.eq("organization_id", params.organizationId);
  const expired = await query;
  if (expired.error) throw new Error(expired.error.message);

  const reconciledConnections = new Set<string>();
  for (const value of expired.data ?? []) {
    const row = value as unknown as OrganizationXeroOauthStateRow;
    const update = await admin
      .from("organization_xero_oauth_states" as never)
      .update({
        status: "expired",
        failure_code: "xero_callback_state_expired",
        failure_message: getSafeXeroRecoveryMessage("xero_callback_state_expired"),
        failure_at: nowIso,
        callback_outcome: "expired",
        updated_at: nowIso,
      } as never)
      .eq("id", row.id)
      .is("used_at", null);
    if (update.error) throw new Error(update.error.message);
    if (row.connection_id) reconciledConnections.add(`${row.organization_id}:${row.connection_id}`);
  }

  for (const key of reconciledConnections) {
    const [organizationId, connectionId] = key.split(":");
    await reconcileConnectionAfterAttemptEnd({
      organizationId: organizationId ?? "",
      connectionId: connectionId ?? null,
    });
  }

  return { expiredCount: expired.data?.length ?? 0 };
}

export async function getLatestXeroOAuthAttempt(organizationId: string) {
  await reconcileExpiredXeroOAuthAttempts({ organizationId });
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_xero_oauth_states" as never)
    .select("id, connection_id, correlation_id, status, created_at, expires_at, redirect_issued_at, callback_received_at, completed_at, failure_code, failure_at, callback_outcome")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as XeroOAuthAttemptSummary | null;
}

export async function getOrganizationXeroConnection(organizationId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_xero_connections" as never)
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as OrganizationXeroConnectionRow | null;
}

async function readXeroTokenSecret(connectionId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_xero_connection_secrets" as never)
    .select("*")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = (data ?? null) as OrganizationXeroConnectionSecretRow | null;
  if (!row) {
    return null;
  }

  const { tokenEncryptionKey } = getXeroEnv();
  return {
    row,
    tokenSet: decryptJsonValue<XeroTokenSet>(row.encrypted_token_set, tokenEncryptionKey),
  };
}

async function markConnectionAttentionRequired(params: {
  connectionId: string;
  organizationId: string;
  message: string;
}) {
  const admin = await getAdmin();
  const { error } = await admin
    .from("organization_xero_connections" as never)
    .update({
      status: "attention_required",
      last_error: params.message,
      last_health_status: "error",
      last_health_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", params.connectionId)
    .eq("organization_id", params.organizationId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCurrentXeroCallbackUserId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }
  return data.user?.id ?? null;
}

export async function createXeroAuthorizationAttempt(params: {
  organizationId: string;
  userId: string;
  redirectPath?: string;
}) {
  const correlationId = randomUUID();
  try {
    await reconcileExpiredXeroOAuthAttempts({ organizationId: params.organizationId });
  } catch (error) {
    throw new XeroOAuthFlowError(
      "xero_connect_state_creation_failed",
      correlationId,
      error instanceof Error ? error.message : undefined,
    );
  }

  const state = createRandomXeroState();
  const stateHash = hashXeroOAuthState(state);
  const attemptId = randomUUID();
  const createdAt = new Date().toISOString();
  const admin = await getAdmin();
  const connection = await getOrganizationXeroConnection(params.organizationId);
  const expiresAt = new Date(Date.now() + XERO_OAUTH_STATE_EXPIRY_MINUTES * 60 * 1_000).toISOString();

  const attemptInsert = await admin
    .from("organization_xero_oauth_states" as never)
    .insert({
      id: attemptId,
      organization_id: params.organizationId,
      user_id: params.userId,
      connection_id: connection?.id ?? null,
      correlation_id: correlationId,
      state_hash: stateHash,
      redirect_path: params.redirectPath ?? SETTINGS_PATH,
      expires_at: expiresAt,
      status: "created",
      callback_outcome: "not_received",
      created_at: createdAt,
      updated_at: createdAt,
    } as never)
    .select("*")
    .single() as unknown as XeroMutationResult<OrganizationXeroOauthStateRow>;

  if (attemptInsert.error || !attemptInsert.data) {
    throw new XeroOAuthFlowError(
      "xero_connect_state_creation_failed",
      correlationId,
      attemptInsert.error?.message,
    );
  }
  const attempt = attemptInsert.data;

  const cancelled = await admin
    .from("organization_xero_oauth_states" as never)
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      failure_code: "xero_callback_state_superseded",
      failure_message: getSafeXeroRecoveryMessage("xero_callback_state_superseded"),
      callback_outcome: "superseded",
    } as never)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .neq("id", attempt.id)
    .lt("created_at", attempt.created_at)
    .in("status", ACTIVE_OAUTH_ATTEMPT_STATUSES as never);
  if (cancelled.error) {
    await markOauthAttemptFailed({
      attemptId: attempt.id,
      code: "xero_connect_state_creation_failed",
    }).catch(() => undefined);
    throw new XeroOAuthFlowError("xero_connect_state_creation_failed", correlationId, cancelled.error.message);
  }
  const cancelledLegacy = await admin
    .from("organization_xero_oauth_states" as never)
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      failure_code: "xero_callback_state_superseded",
      failure_message: getSafeXeroRecoveryMessage("xero_callback_state_superseded"),
      callback_outcome: "superseded",
    } as never)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .neq("id", attempt.id)
    .lt("created_at", attempt.created_at)
    .is("status", null)
    .is("used_at", null);
  if (cancelledLegacy.error) {
    await markOauthAttemptFailed({
      attemptId: attempt.id,
      code: "xero_connect_state_creation_failed",
    }).catch(() => undefined);
    throw new XeroOAuthFlowError("xero_connect_state_creation_failed", correlationId, cancelledLegacy.error.message);
  }
  for (const legacyStatus of [false, true]) {
    let sameTimestampQuery = admin
      .from("organization_xero_oauth_states" as never)
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        failure_code: "xero_callback_state_superseded",
        failure_message: getSafeXeroRecoveryMessage("xero_callback_state_superseded"),
        callback_outcome: "superseded",
      } as never)
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.userId)
      .eq("created_at", attempt.created_at)
      .lt("id", attempt.id)
      .is("used_at", null);
    sameTimestampQuery = legacyStatus
      ? sameTimestampQuery.is("status", null)
      : sameTimestampQuery.in("status", ACTIVE_OAUTH_ATTEMPT_STATUSES as never);
    const sameTimestampCancellation = await sameTimestampQuery;
    if (sameTimestampCancellation.error) {
      await markOauthAttemptFailed({
        attemptId: attempt.id,
        code: "xero_connect_state_creation_failed",
      }).catch(() => undefined);
      throw new XeroOAuthFlowError(
        "xero_connect_state_creation_failed",
        correlationId,
        sameTimestampCancellation.error.message,
      );
    }
  }

  const connectionUpdate = await admin
    .from("organization_xero_connections" as never)
    .upsert(
      {
        organization_id: params.organizationId,
        status: "pending_authorization",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id" },
    )
    .select("*")
    .single() as unknown as XeroMutationResult<OrganizationXeroConnectionRow>;

  if (connectionUpdate.error || !connectionUpdate.data) {
    await markOauthAttemptFailed({
      attemptId: attempt.id,
      code: "xero_connect_connection_update_failed",
    }).catch(() => undefined);
    throw new XeroOAuthFlowError(
      "xero_connect_connection_update_failed",
      correlationId,
      connectionUpdate.error?.message,
    );
  }

  const preparedConnection = connectionUpdate.data;
  let authorizeUrl: string;
  try {
    authorizeUrl = buildXeroAuthorizeUrl(state);
  } catch (error) {
    await markOauthAttemptFailed({
      attemptId: attempt.id,
      code: "xero_connect_configuration_error",
    }).catch(() => undefined);
    await reconcileConnectionAfterAttemptEnd({
      organizationId: params.organizationId,
      connectionId: preparedConnection.id,
    }).catch(() => undefined);
    throw new XeroOAuthFlowError(
      "xero_connect_configuration_error",
      correlationId,
      error instanceof Error ? error.message : undefined,
    );
  }

  const redirectIssued = await admin
    .from("organization_xero_oauth_states" as never)
    .update({
      connection_id: preparedConnection.id,
      status: "redirect_issued",
      redirect_issued_at: new Date().toISOString(),
      callback_outcome: "not_received",
    } as never)
    .eq("id", attempt.id)
    .eq("status", "created");
  if (redirectIssued.error) {
    await markOauthAttemptFailed({
      attemptId: attempt.id,
      code: "xero_connect_redirect_failed",
    }).catch(() => undefined);
    await reconcileConnectionAfterAttemptEnd({
      organizationId: params.organizationId,
      connectionId: preparedConnection.id,
    }).catch(() => undefined);
    throw new XeroOAuthFlowError("xero_connect_redirect_failed", correlationId, redirectIssued.error.message);
  }

  return {
    authorizeUrl,
    attemptId: attempt.id,
    correlationId,
    expiresAt,
  };
}

export async function createXeroAuthorizationUrl(params: {
  organizationId: string;
  userId: string;
  redirectPath?: string;
}) {
  return (await createXeroAuthorizationAttempt(params)).authorizeUrl;
}

async function claimOauthAttempt(params: {
  state: string;
  currentUserId: string;
}) {
  const admin = await getAdmin();
  const stateHash = hashXeroOAuthState(params.state);
  const { data, error } = await admin
    .from("organization_xero_oauth_states" as never)
    .select("*")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = (data ?? null) as OrganizationXeroOauthStateRow | null;
  if (!row) throw new XeroOAuthFlowError("xero_callback_state_invalid", randomUUID());
  const correlationId = row.correlation_id ?? row.id;
  if (row.status === "cancelled") throw new XeroOAuthFlowError("xero_callback_state_superseded", correlationId);
  if (["completed", "failed", "callback_received"].includes(row.status ?? "") || row.used_at) {
    throw new XeroOAuthFlowError("xero_callback_state_invalid", correlationId);
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    await admin
      .from("organization_xero_oauth_states" as never)
      .update({
        status: "expired",
        failure_code: "xero_callback_state_expired",
        failure_message: getSafeXeroRecoveryMessage("xero_callback_state_expired"),
        failure_at: new Date().toISOString(),
        callback_outcome: "expired",
      } as never)
      .eq("id", row.id);
    await reconcileConnectionAfterAttemptEnd({
      organizationId: row.organization_id,
      connectionId: row.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_state_expired", correlationId);
  }
  if (row.user_id !== params.currentUserId) {
    await markOauthAttemptFailed({
      attemptId: row.id,
      code: "xero_callback_wrong_user",
      callbackOutcome: "wrong_user",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: row.organization_id,
      connectionId: row.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_wrong_user", correlationId);
  }

  const membershipCheck = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("user_id", params.currentUserId)
    .maybeSingle();

  if (membershipCheck.error) {
    await markOauthAttemptFailed({
      attemptId: row.id,
      code: "xero_callback_membership_invalid",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: row.organization_id,
      connectionId: row.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_membership_invalid", correlationId, membershipCheck.error.message);
  }
  if (!membershipCheck.data) {
    await markOauthAttemptFailed({
      attemptId: row.id,
      code: "xero_callback_membership_invalid",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: row.organization_id,
      connectionId: row.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_membership_invalid", correlationId);
  }

  let connectionId = row.connection_id;
  if (!connectionId) {
    const connection = await getOrganizationXeroConnection(row.organization_id);
    connectionId = connection?.id ?? null;
  }
  if (!connectionId) {
    await markOauthAttemptFailed({
      attemptId: row.id,
      code: "xero_callback_persistence_failed",
    });
    throw new XeroOAuthFlowError("xero_callback_persistence_failed", correlationId);
  }

  let claimQuery = admin
    .from("organization_xero_oauth_states" as never)
    .update({
      connection_id: connectionId,
      status: "callback_received",
      callback_received_at: new Date().toISOString(),
      callback_outcome: "received",
    } as never)
    .eq("id", row.id)
    .is("used_at", null);
  claimQuery = row.status
    ? claimQuery.eq("status", row.status)
    : claimQuery.is("status", null);
  const claimed = await claimQuery
    .select("id")
    .maybeSingle();

  if (claimed.error || !claimed.data) {
    throw new XeroOAuthFlowError("xero_callback_state_invalid", correlationId, claimed.error?.message);
  }

  return { ...row, connection_id: connectionId, status: "callback_received" as const };
}

export async function completeXeroOAuthCallback(params: { code: string; state: string; currentUserId: string }) {
  const oauthState = await claimOauthAttempt({
    state: params.state,
    currentUserId: params.currentUserId,
  });
  const correlationId = oauthState.correlation_id ?? oauthState.id;
  let tokenSet: XeroTokenSet;
  try {
    tokenSet = normalizeTokenSet(await exchangeXeroAuthorizationCode(params.code));
  } catch (error) {
    await markOauthAttemptFailed({
      attemptId: oauthState.id,
      code: "xero_callback_token_exchange_failed",
      callbackOutcome: "token_exchange_failed",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: oauthState.organization_id,
      connectionId: oauthState.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_token_exchange_failed", correlationId, error instanceof Error ? error.message : undefined);
  }

  let connections: XeroConnection[];
  try {
    connections = await listXeroConnections(tokenSet.access_token);
  } catch (error) {
    await markOauthAttemptFailed({
      attemptId: oauthState.id,
      code: "xero_callback_tenant_discovery_failed",
      callbackOutcome: "tenant_discovery_failed",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: oauthState.organization_id,
      connectionId: oauthState.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_tenant_discovery_failed", correlationId, error instanceof Error ? error.message : undefined);
  }

  if (connections.length === 0) {
    await markOauthAttemptFailed({
      attemptId: oauthState.id,
      code: "xero_callback_no_tenants",
      callbackOutcome: "no_tenants",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: oauthState.organization_id,
      connectionId: oauthState.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_no_tenants", correlationId);
  }

  const jwtPayload = decodeJwtPayload(tokenSet.id_token);
  const xeroUserId = typeof jwtPayload?.sub === "string" ? jwtPayload.sub : null;
  const storedTenants = connections.map(toStoredTenant);
  const selectedTenant = storedTenants.length === 1 ? storedTenants[0] ?? null : null;
  const admin = await getAdmin();
  let encryptedTokenSet: string;
  try {
    encryptedTokenSet = encryptJsonValue(tokenSet, getXeroEnv().tokenEncryptionKey);
  } catch (error) {
    await markOauthAttemptFailed({
      attemptId: oauthState.id,
      code: "xero_callback_token_encryption_failed",
      callbackOutcome: "token_encryption_failed",
    });
    await reconcileConnectionAfterAttemptEnd({
      organizationId: oauthState.organization_id,
      connectionId: oauthState.connection_id,
    });
    throw new XeroOAuthFlowError("xero_callback_token_encryption_failed", correlationId, error instanceof Error ? error.message : undefined);
  }

  const finalized = await admin.rpc("finalize_xero_oauth_attempt" as never, {
    p_attempt_id: oauthState.id,
    p_organization_id: oauthState.organization_id,
    p_connection_id: oauthState.connection_id,
    p_encrypted_token_set: encryptedTokenSet,
    p_encryption_version: 1,
    p_connection_status: selectedTenant ? "connected" : "awaiting_tenant_selection",
    p_tenant_id: selectedTenant?.tenantId ?? null,
    p_tenant_name: selectedTenant?.tenantName ?? null,
    p_tenant_type: selectedTenant?.tenantType ?? null,
    p_tenant_connection_id: selectedTenant?.connectionId ?? null,
    p_xero_user_id: xeroUserId,
    p_scope: Array.isArray(tokenSet.scope) ? tokenSet.scope : [],
    p_available_tenants_json: storedTenants,
    p_token_expires_at: addSecondsToIso(tokenSet.expires_in),
    p_refresh_token_expires_at: inferRefreshExpiryIso(),
    p_connected_by_user_id: oauthState.user_id,
    p_callback_outcome: selectedTenant ? "connected" : "tenant_selection_required",
  } as never) as unknown as XeroMutationResult<OrganizationXeroConnectionRow>;

  if (finalized.error || !finalized.data) {
    await markOauthAttemptFailed({
      attemptId: oauthState.id,
      code: "xero_callback_persistence_failed",
      callbackOutcome: "persistence_failed",
    }).catch(() => undefined);
    await reconcileConnectionAfterAttemptEnd({
      organizationId: oauthState.organization_id,
      connectionId: oauthState.connection_id,
    }).catch(() => undefined);
    throw new XeroOAuthFlowError("xero_callback_persistence_failed", correlationId, finalized.error?.message);
  }

  const connection = finalized.data;

  return {
    organizationId: oauthState.organization_id,
    redirectPath: oauthState.redirect_path || SETTINGS_PATH,
    connection,
    autoSelectedTenant: selectedTenant,
    correlationId,
  };
}

export async function recordXeroOAuthCallbackFailure(params: {
  state: string;
  currentUserId: string;
  code: "xero_callback_access_denied" | "xero_callback_missing_parameters";
}) {
  const attempt = await claimOauthAttempt({
    state: params.state,
    currentUserId: params.currentUserId,
  });
  await markOauthAttemptFailed({
    attemptId: attempt.id,
    code: params.code,
    callbackOutcome: params.code === "xero_callback_access_denied" ? "access_denied" : "missing_parameters",
  });
  await reconcileConnectionAfterAttemptEnd({
    organizationId: attempt.organization_id,
    connectionId: attempt.connection_id,
  });
  return { correlationId: attempt.correlation_id ?? attempt.id };
}

export const XERO_OAUTH_STATE_RETENTION = {
  expiryMinutes: XERO_OAUTH_STATE_EXPIRY_MINUTES,
  historyDeletionEnabled: false,
} as const;

export async function getFreshXeroAccessToken(organizationId: string) {
  const connection = await getOrganizationXeroConnection(organizationId);
  if (!connection || !connection.id) {
    throw new Error("Xero is not connected for this organization.");
  }
  if (connection.status === "disconnected") {
    throw new Error("Xero is disconnected for this organization.");
  }
  if (connection.status === "attention_required") {
    throw new Error("The Xero connection requires attention before sync can continue.");
  }

  const storedTokenState = await readXeroTokenSecret(connection.id);
  if (!storedTokenState?.tokenSet.refresh_token) {
    throw new Error("Stored Xero tokens are missing.");
  }
  const storedTokenSet = storedTokenState.tokenSet;

  const tokenExpiresAtMs = connection.token_expires_at ? Date.parse(connection.token_expires_at) : null;
  if (tokenExpiresAtMs && tokenExpiresAtMs - Date.now() > 5 * 60 * 1_000 && storedTokenSet.access_token) {
    return {
      connection,
      tokenSet: storedTokenSet,
    };
  }

  let refreshedTokenSet: XeroTokenSet;

  try {
    refreshedTokenSet = normalizeTokenSet(
      await refreshXeroToken(storedTokenSet.refresh_token),
      storedTokenSet.refresh_token,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xero token refresh failed.";
    if (error instanceof XeroRequestError && error.status >= 400 && error.status < 500) {
      await markConnectionAttentionRequired({
        connectionId: connection.id,
        organizationId,
        message,
      });
    }
    throw error;
  }

  const admin = await getAdmin();
  const saveSecret = await admin
    .from("organization_xero_connection_secrets" as never)
    .update({
      encrypted_token_set: encryptJsonValue(refreshedTokenSet, getXeroEnv().tokenEncryptionKey),
      encryption_version: 1,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("connection_id", connection.id)
    .eq("updated_at", storedTokenState.row.updated_at)
    .select("updated_at")
    .maybeSingle();

  if (saveSecret.error) {
    throw new Error(saveSecret.error.message);
  }

  if (!saveSecret.data) {
    const latestConnection = await getOrganizationXeroConnection(organizationId);
    const latestSecretState = await readXeroTokenSecret(connection.id);
    if (latestConnection && latestSecretState?.tokenSet.access_token) {
      return {
        connection: latestConnection,
        tokenSet: latestSecretState.tokenSet,
      };
    }

    throw new Error("Xero tokens changed concurrently and could not be reloaded safely.");
  }

  const { error } = await admin
    .from("organization_xero_connections" as never)
    .update({
      status: "connected",
      token_expires_at: addSecondsToIso(refreshedTokenSet.expires_in),
      refresh_token_expires_at: inferRefreshExpiryIso(),
      scope: Array.isArray(refreshedTokenSet.scope) ? refreshedTokenSet.scope : [],
      last_error: null,
      last_health_status: "healthy",
      last_health_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", connection.id)
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    connection: {
      ...connection,
      token_expires_at: addSecondsToIso(refreshedTokenSet.expires_in),
      refresh_token_expires_at: inferRefreshExpiryIso(),
      scope: Array.isArray(refreshedTokenSet.scope) ? refreshedTokenSet.scope : [],
      last_error: null,
    } satisfies OrganizationXeroConnectionRow,
    tokenSet: refreshedTokenSet,
  };
}

export async function selectOrganizationXeroTenant(params: {
  organizationId: string;
  tenantId: string;
  userId: string;
}) {
  const { connection, tokenSet } = await getFreshXeroAccessToken(params.organizationId);
  const liveConnections = await listXeroConnections(tokenSet.access_token);
  const selectedTenant = liveConnections.map(toStoredTenant).find((tenant) => tenant.tenantId === params.tenantId) ?? null;

  if (!selectedTenant) {
    throw new Error("The selected Xero tenant could not be found.");
  }

  const admin = await getAdmin();
  const existingImportedRows = await admin
    .from("organization_cost_codes")
    .select("id, metadata")
    .eq("organization_id", params.organizationId)
    .eq("external_provider", "xero")
    .limit(1);

  if (existingImportedRows.error) {
    throw new Error(existingImportedRows.error.message);
  }

  let importedTenantId: string | null = null;
  for (const row of existingImportedRows.data ?? []) {
    const metadata = row.metadata;
    if (
      metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && typeof metadata.tenantId === "string"
      && metadata.tenantId.trim()
    ) {
      importedTenantId = metadata.tenantId.trim();
      break;
    }
  }

  if (importedTenantId && importedTenantId !== selectedTenant.tenantId) {
    throw new Error(
      "This organization already has Xero reference data from a different tenant. Disconnect and clear or migrate those mappings before attaching another tenant.",
    );
  }

  const { error } = await admin
    .from("organization_xero_connections" as never)
    .update({
      status: "connected",
      tenant_id: selectedTenant.tenantId,
      tenant_name: selectedTenant.tenantName,
      tenant_type: selectedTenant.tenantType,
      tenant_connection_id: selectedTenant.connectionId,
      available_tenants_json: liveConnections.map(toStoredTenant),
      connected_by_user_id: params.userId,
      last_health_status: "healthy",
      last_health_checked_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", connection.id)
    .eq("organization_id", params.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  return selectedTenant;
}

export async function disconnectOrganizationXero(params: {
  organizationId: string;
}) {
  const existing = await getOrganizationXeroConnection(params.organizationId);
  if (!existing) {
    return;
  }

  if (existing.tenant_connection_id) {
    const { tokenSet } = await getFreshXeroAccessToken(params.organizationId);
    if (tokenSet.access_token) {
      await disconnectXeroTenant(tokenSet.access_token, existing.tenant_connection_id);
    }
  }

  const admin = await getAdmin();
  const { error: updateError } = await admin
    .from("organization_xero_connections" as never)
    .update({
      status: "disconnected",
      tenant_id: null,
      tenant_name: null,
      tenant_type: null,
      tenant_connection_id: null,
      available_tenants_json: [],
      last_health_status: "disconnected",
      last_health_checked_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", existing.id)
    .eq("organization_id", params.organizationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: queueError } = await admin
    .from("organization_accounting_sync_jobs" as never)
    .update({
      queue_state: "dead_lettered",
      last_error: "Xero connection disconnected before the job could run.",
      claimed_at: null,
      claimed_by: null,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .in("queue_state", ["pending", "claimed", "retry_scheduled"] as never);

  if (queueError) {
    throw new Error(queueError.message);
  }

  const { error: secretDeleteError } = await admin
    .from("organization_xero_connection_secrets" as never)
    .delete()
    .eq("connection_id", existing.id);

  if (secretDeleteError) {
    throw new Error(secretDeleteError.message);
  }
}

export function buildIntegrationRedirect(params: {
  message?: string;
  error?: string;
}) {
  const query = new URLSearchParams();

  if (params.message) {
    query.set("message", params.message);
  }
  if (params.error) {
    query.set("error", params.error);
  }

  const suffix = query.toString();
  return suffix ? `${SETTINGS_PATH}?${suffix}` : SETTINGS_PATH;
}
