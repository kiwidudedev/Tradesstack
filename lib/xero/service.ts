import "server-only";

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
const XERO_USED_OAUTH_STATE_RETENTION_HOURS = 24;

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

type OrganizationXeroOauthStateRow = {
  id: string;
  organization_id: string;
  user_id: string;
  state_hash: string;
  redirect_path: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

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

async function cleanupExpiredXeroOauthStates() {
  const admin = await getAdmin();
  const nowIso = new Date().toISOString();
  const usedRetentionFloorIso = new Date(Date.now() - XERO_USED_OAUTH_STATE_RETENTION_HOURS * 60 * 60 * 1_000).toISOString();

  const { error } = await admin
    .from("organization_xero_oauth_states" as never)
    .delete()
    .or(`and(used_at.is.null,expires_at.lt.${nowIso}),and(used_at.not.is.null,used_at.lt.${usedRetentionFloorIso})`);

  if (error) {
    throw new Error(error.message);
  }
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

async function saveXeroTokenSecret(connectionId: string, tokenSet: XeroTokenSet) {
  const admin = await getAdmin();
  const { tokenEncryptionKey } = getXeroEnv();
  const encryptedTokenSet = encryptJsonValue(tokenSet, tokenEncryptionKey);
  const { error } = await admin.from("organization_xero_connection_secrets" as never).upsert(
    {
      connection_id: connectionId,
      encrypted_token_set: encryptedTokenSet,
      encryption_version: 1,
      updated_at: new Date().toISOString(),
    } as never,
    {
      onConflict: "connection_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
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

export async function createXeroAuthorizationUrl(params: {
  organizationId: string;
  userId: string;
  redirectPath?: string;
}) {
  await cleanupExpiredXeroOauthStates();
  const state = createRandomXeroState();
  const stateHash = hashXeroOAuthState(state);
  const admin = await getAdmin();

  const { error } = await admin.from("organization_xero_oauth_states" as never).insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    state_hash: stateHash,
    redirect_path: params.redirectPath ?? SETTINGS_PATH,
    expires_at: new Date(Date.now() + XERO_OAUTH_STATE_EXPIRY_MINUTES * 60 * 1_000).toISOString(),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const connectionUpdate = await admin
    .from("organization_xero_connections" as never)
    .upsert(
      {
        organization_id: params.organizationId,
        status: "pending_authorization",
        last_error: null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id" },
    );

  if (connectionUpdate.error) {
    throw new Error(connectionUpdate.error.message);
  }

  return buildXeroAuthorizeUrl(state);
}

async function consumeOauthState(params: {
  state: string;
  currentUserId: string;
}) {
  const admin = await getAdmin();
  const stateHash = hashXeroOAuthState(params.state);
  const { data, error } = await admin
    .from("organization_xero_oauth_states" as never)
    .select("*")
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = (data ?? null) as OrganizationXeroOauthStateRow | null;
  if (!row) {
    throw new Error("Xero authorization state is missing or has already been used.");
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    throw new Error("Xero authorization state has expired. Start the connection again.");
  }
  if (row.user_id !== params.currentUserId) {
    throw new Error("This Xero callback does not belong to the current signed-in user.");
  }

  const membershipCheck = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("user_id", params.currentUserId)
    .maybeSingle();

  if (membershipCheck.error) {
    throw new Error(membershipCheck.error.message);
  }
  if (!membershipCheck.data) {
    throw new Error("You are no longer a member of the organization that started this Xero connection.");
  }

  const { error: updateError } = await admin
    .from("organization_xero_oauth_states" as never)
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id", row.id)
    .is("used_at", null);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return row;
}

export async function completeXeroOAuthCallback(params: { code: string; state: string; currentUserId: string }) {
  const oauthState = await consumeOauthState({
    state: params.state,
    currentUserId: params.currentUserId,
  });
  const tokenSet = normalizeTokenSet(await exchangeXeroAuthorizationCode(params.code));
  const connections = await listXeroConnections(tokenSet.access_token);

  if (connections.length === 0) {
    throw new Error("Xero returned no tenants for this authorization.");
  }

  const jwtPayload = decodeJwtPayload(tokenSet.id_token);
  const xeroUserId = typeof jwtPayload?.sub === "string" ? jwtPayload.sub : null;
  const storedTenants = connections.map(toStoredTenant);
  const selectedTenant = storedTenants.length === 1 ? storedTenants[0] ?? null : null;
  const admin = await getAdmin();

  const { data, error } = await admin
    .from("organization_xero_connections" as never)
    .upsert(
      {
        organization_id: oauthState.organization_id,
        status: selectedTenant ? "connected" : "awaiting_tenant_selection",
        tenant_id: selectedTenant?.tenantId ?? null,
        tenant_name: selectedTenant?.tenantName ?? null,
        tenant_type: selectedTenant?.tenantType ?? null,
        tenant_connection_id: selectedTenant?.connectionId ?? null,
        xero_user_id: xeroUserId,
        scope: Array.isArray(tokenSet.scope) ? tokenSet.scope : [],
        available_tenants_json: storedTenants,
        token_expires_at: addSecondsToIso(tokenSet.expires_in),
        refresh_token_expires_at: inferRefreshExpiryIso(),
        last_health_status: selectedTenant ? "healthy" : null,
        last_health_checked_at: selectedTenant ? new Date().toISOString() : null,
        last_error: null,
        connected_by_user_id: oauthState.user_id,
        updated_at: new Date().toISOString(),
      } as never,
      {
        onConflict: "organization_id",
      },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save the Xero connection.");
  }

  const connection = data as OrganizationXeroConnectionRow;
  await saveXeroTokenSecret(connection.id, tokenSet);
  await cleanupExpiredXeroOauthStates();

  return {
    organizationId: oauthState.organization_id,
    redirectPath: oauthState.redirect_path || SETTINGS_PATH,
    connection,
    autoSelectedTenant: selectedTenant,
  };
}

export const XERO_OAUTH_STATE_RETENTION = {
  expiryMinutes: XERO_OAUTH_STATE_EXPIRY_MINUTES,
  usedRetentionHours: XERO_USED_OAUTH_STATE_RETENTION_HOURS,
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
