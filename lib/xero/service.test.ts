import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();
const createServerSupabaseClient = vi.fn();
const getXeroEnv = vi.fn(() => ({
  clientId: "client",
  clientSecret: "secret",
  redirectUri: "https://app.example.com/api/integrations/xero/callback",
  siteUrl: "https://app.example.com",
  scopes: ["openid", "profile", "email", "accounting.settings", "offline_access"],
  tokenEncryptionKey: "key",
}));
const encryptJsonValue = vi.fn((value: unknown) => JSON.stringify(value));
const decryptJsonValue = vi.fn((value: string) => JSON.parse(value));
const buildXeroAuthorizeUrl = vi.fn(() => "https://login.xero.example/authorize");
const disconnectXeroTenant = vi.fn();
const exchangeXeroAuthorizationCode = vi.fn();
const listXeroConnections = vi.fn();
const refreshXeroToken = vi.fn();

class MockXeroRequestError extends Error {
  status: number;
  isRetryable: boolean;

  constructor(message: string, options: { status: number; isRetryable?: boolean }) {
    super(message);
    this.name = "XeroRequestError";
    this.status = options.status;
    this.isRetryable = options.isRetryable ?? false;
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("@/lib/xero/env", () => ({
  getXeroEnv,
}));

vi.mock("@/lib/xero/crypto", () => ({
  createRandomXeroState: vi.fn(() => "random-state"),
  decryptJsonValue,
  encryptJsonValue,
  hashXeroOAuthState: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("@/lib/xero/client", () => ({
  buildXeroAuthorizeUrl,
  disconnectXeroTenant,
  exchangeXeroAuthorizationCode,
  listXeroConnections,
  refreshXeroToken,
  XeroRequestError: MockXeroRequestError,
}));

function createAdminClient(state: {
  organization_xero_connections: Array<Record<string, unknown>>;
  organization_xero_connection_secrets: Array<Record<string, unknown>>;
  organization_xero_oauth_states: Array<Record<string, unknown>>;
  organization_members: Array<Record<string, unknown>>;
  organization_cost_codes?: Array<Record<string, unknown>>;
  organization_accounting_sync_jobs?: Array<Record<string, unknown>>;
}, options?: {
  simulateSecretCasMiss?: boolean;
  rpcResult?: { data: unknown; error: { message: string } | null };
  onRpc?: (name: string, args: Record<string, unknown>) => void;
}) {
  function matchesFilters(row: Record<string, unknown>, filters: Array<(row: Record<string, unknown>) => boolean>) {
    return filters.every((filter) => filter(row));
  }

  return {
    async rpc(name: string, args: Record<string, unknown>) {
      options?.onRpc?.(name, args);
      return options?.rpcResult ?? { data: null, error: { message: "RPC not mocked" } };
    },
    from(table: keyof typeof state) {
      const filtersTyped: Array<(row: Record<string, unknown>) => boolean> = [];
      let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
      let payload: Array<Record<string, unknown>> | Record<string, unknown> | null = null;
      let limitCount: number | null = null;
      let conflictKey: string | null = null;

      const builder = {
        select() {
          if (mode === "select") {
            mode = "select";
          }
          return builder;
        },
        insert(value: Record<string, unknown> | Array<Record<string, unknown>>) {
          mode = "insert";
          payload = Array.isArray(value) ? value : [value];
          return builder;
        },
        update(value: Record<string, unknown>) {
          mode = "update";
          payload = value;
          return builder;
        },
        delete() {
          mode = "delete";
          return builder;
        },
        upsert(value: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string }) {
          mode = "upsert";
          payload = Array.isArray(value) ? value : [value];
          conflictKey = options?.onConflict ?? null;
          return builder;
        },
        eq(field: string, value: unknown) {
          filtersTyped.push((row) => row[field] === value);
          return builder;
        },
        neq(field: string, value: unknown) {
          filtersTyped.push((row) => row[field] !== value);
          return builder;
        },
        lt(field: string, value: string) {
          filtersTyped.push((row) => typeof row[field] === "string" && String(row[field]) < value);
          return builder;
        },
        gt(field: string, value: string) {
          filtersTyped.push((row) => typeof row[field] === "string" && String(row[field]) > value);
          return builder;
        },
        in(field: string, values: unknown[]) {
          filtersTyped.push((row) => values.includes(row[field]));
          return builder;
        },
        is(field: string, value: unknown) {
          filtersTyped.push((row) => row[field] === value);
          return builder;
        },
        order() {
          return builder;
        },
        limit(value: number) {
          limitCount = value;
          return builder;
        },
        or(expression: string) {
          if (expression === "status.is.null,status.in.(created,redirect_issued,callback_received)") {
            filtersTyped.push((row) => row.status == null || ["created", "redirect_issued", "callback_received"].includes(String(row.status)));
          }
          return builder;
        },
        maybeSingle() {
          return execute({ maybeSingle: true });
        },
        single() {
          return execute({ single: true });
        },
        then(onFulfilled: (value: { data?: unknown; error: null }) => unknown) {
          return execute({}).then(onFulfilled);
        },
      };

      function filteredRows() {
        const rows = [...(state[table] ?? [])].filter((row) => matchesFilters(row, filtersTyped));
        return limitCount == null ? rows : rows.slice(0, limitCount);
      }

      async function execute(resultMode: { maybeSingle?: boolean; single?: boolean }) {
        if (mode === "select") {
          const rows = filteredRows();
          if (resultMode.single || resultMode.maybeSingle) {
            return { data: rows[0] ?? null, error: null };
          }
          return { data: rows, error: null };
        }

        if (mode === "insert") {
          const target = state[table] as Array<Record<string, unknown>>;
          const rowsToInsert = Array.isArray(payload) ? payload : [];
          rowsToInsert.forEach((row) => target.push({ ...row }));
          const rows = filteredRows();
          if (resultMode.single || resultMode.maybeSingle) {
            return { data: rowsToInsert[0] ?? rows[0] ?? null, error: null };
          }
          return { data: rowsToInsert, error: null };
        }

        if (mode === "upsert") {
          const target = state[table] as Array<Record<string, unknown>>;
          const rowsToUpsert = Array.isArray(payload) ? payload : [];
          for (const row of rowsToUpsert) {
            if (table === "organization_xero_connections" && !row.id) {
              row.id = "generated-connection";
            }
            const key = conflictKey;
            if (key != null) {
              const existing = target.find((candidate) => candidate[key] === row[key]);
              if (existing) {
                Object.assign(existing, row);
                continue;
              }
            }
            target.push({ ...row });
          }

          const rows = filteredRows();
          if (resultMode.single || resultMode.maybeSingle) {
            return { data: rows[0] ?? rowsToUpsert[0] ?? null, error: null };
          }
          return { data: rowsToUpsert, error: null };
        }

        if (mode === "update") {
          const target = state[table] as Array<Record<string, unknown>>;
          const rows = target.filter((row) => matchesFilters(row, filtersTyped));

          if (table === "organization_xero_connection_secrets" && resultMode.maybeSingle && options?.simulateSecretCasMiss) {
            return { data: null, error: null };
          }

          const updatePayload = payload && !Array.isArray(payload) ? payload : {};
          rows.forEach((row) => Object.assign(row, updatePayload));
          if (resultMode.single || resultMode.maybeSingle) {
            return { data: rows[0] ?? null, error: null };
          }
          return { data: rows, error: null };
        }

        if (mode === "delete") {
          const target = state[table] as Array<Record<string, unknown>>;
          const remaining = target.filter((row) => !matchesFilters(row, filtersTyped));
          const mutableState = state as Record<string, Array<Record<string, unknown>>>;
          mutableState[String(table)] = remaining;
          return { error: null };
        }

        return { data: null, error: null };
      }

      return builder;
    },
  };
}

describe("xero service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });
  });

  it("preserves OAuth history while expiring and superseding unfinished attempts", async () => {
    const state = {
      organization_xero_connections: [],
      organization_xero_connection_secrets: [],
      organization_xero_oauth_states: [
        {
          id: "expired-unused",
          organization_id: "org-1",
          user_id: "user-1",
          state_hash: "old",
          redirect_path: "/app/settings/integrations",
          expires_at: "2026-01-01T00:00:00.000Z",
          used_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "active-unused",
          organization_id: "org-1",
          user_id: "user-1",
          state_hash: "active",
          redirect_path: "/app/settings/integrations",
          expires_at: "2099-01-01T00:00:00.000Z",
          used_at: null,
          status: "redirect_issued",
          created_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "old-used",
          organization_id: "org-1",
          user_id: "user-1",
          state_hash: "used",
          redirect_path: "/app/settings/integrations",
          expires_at: "2026-01-01T00:00:00.000Z",
          used_at: "2026-01-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      organization_members: [],
    };

    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));

    const { createXeroAuthorizationUrl } = await import("./service");
    const url = await createXeroAuthorizationUrl({
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(url).toBe("https://login.xero.example/authorize");
    expect(state.organization_xero_oauth_states.find((row) => row.id === "expired-unused")?.status).toBe("expired");
    expect(state.organization_xero_oauth_states.some((row) => row.id === "old-used")).toBe(true);
    expect(state.organization_xero_oauth_states.find((row) => row.id === "active-unused")?.status).toBe("cancelled");
    expect(state.organization_xero_oauth_states.some((row) => row.status === "redirect_issued")).toBe(true);
  });

  it("marks the connection attention_required after an unrecoverable refresh failure", async () => {
    const state = {
      organization_xero_connections: [
        {
          id: "conn-1",
          organization_id: "org-1",
          status: "connected",
          token_expires_at: "2020-01-01T00:00:00.000Z",
          refresh_token_expires_at: "2099-01-01T00:00:00.000Z",
          scope: [],
          last_error: null,
          last_health_status: "healthy",
          last_health_checked_at: null,
        },
      ],
      organization_xero_connection_secrets: [
        {
          connection_id: "conn-1",
          encrypted_token_set: JSON.stringify({
            access_token: "access",
            refresh_token: "refresh",
            scope: [],
          }),
          encryption_version: 1,
          updated_at: "2026-07-15T07:00:00.000Z",
        },
      ],
      organization_xero_oauth_states: [],
      organization_members: [],
    };

    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    refreshXeroToken.mockRejectedValue(new MockXeroRequestError("invalid_grant", { status: 401 }));

    const { getFreshXeroAccessToken } = await import("./service");
    await expect(getFreshXeroAccessToken("org-1")).rejects.toThrow("invalid_grant");

    expect(state.organization_xero_connections[0]?.status).toBe("attention_required");
    expect(state.organization_xero_connections[0]?.last_error).toBe("invalid_grant");
  });

  it("finalizes a one-tenant callback through the atomic persistence RPC", async () => {
    const connection = {
      id: "conn-1",
      organization_id: "org-1",
      status: "connected",
      tenant_id: "tenant-1",
      connected_by_user_id: "user-1",
    };
    const state = {
      organization_xero_connections: [{ ...connection, status: "pending_authorization" }],
      organization_xero_connection_secrets: [],
      organization_xero_oauth_states: [{
        id: "attempt-1",
        organization_id: "org-1",
        user_id: "user-1",
        connection_id: "conn-1",
        correlation_id: "correlation-1",
        state_hash: "hash:callback-state",
        redirect_path: "/app/settings/integrations",
        expires_at: "2099-01-01T00:00:00.000Z",
        used_at: null,
        status: "redirect_issued",
        created_at: "2026-08-01T00:00:00.000Z",
      }],
      organization_members: [{ id: "member-1", organization_id: "org-1", user_id: "user-1" }],
    };
    let rpcArgs: Record<string, unknown> | null = null;
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state, {
      rpcResult: { data: connection, error: null },
      onRpc: (_name, args) => { rpcArgs = args; },
    }));
    exchangeXeroAuthorizationCode.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 1800,
      scope: ["openid", "offline_access"],
    });
    listXeroConnections.mockResolvedValue([{
      id: "tenant-connection-1",
      tenantId: "tenant-1",
      tenantName: "Tradesstack TEST",
      tenantType: "ORGANISATION",
    }]);

    const { completeXeroOAuthCallback } = await import("./service");
    const result = await completeXeroOAuthCallback({
      code: "code-1",
      state: "callback-state",
      currentUserId: "user-1",
    });

    expect(result.connection.id).toBe("conn-1");
    expect(result.autoSelectedTenant?.tenantId).toBe("tenant-1");
    expect(rpcArgs).toMatchObject({
      p_attempt_id: "attempt-1",
      p_connection_id: "conn-1",
      p_connection_status: "connected",
      p_tenant_id: "tenant-1",
      p_callback_outcome: "connected",
    });
    expect(JSON.stringify(rpcArgs)).not.toContain("callback-state");
    expect(JSON.stringify(rpcArgs)).not.toContain("code-1");
  });

  it("records token-exchange failure and leaves no successful callback state", async () => {
    const state = {
      organization_xero_connections: [{
        id: "conn-1",
        organization_id: "org-1",
        status: "pending_authorization",
      }],
      organization_xero_connection_secrets: [],
      organization_xero_oauth_states: [{
        id: "attempt-1",
        organization_id: "org-1",
        user_id: "user-1",
        connection_id: "conn-1",
        correlation_id: "correlation-1",
        state_hash: "hash:callback-state",
        redirect_path: "/app/settings/integrations",
        expires_at: "2099-01-01T00:00:00.000Z",
        used_at: null,
        status: "redirect_issued",
        failure_code: null,
        created_at: "2026-08-01T00:00:00.000Z",
      }],
      organization_members: [{ id: "member-1", organization_id: "org-1", user_id: "user-1" }],
    };
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    exchangeXeroAuthorizationCode.mockRejectedValue(new Error("provider rejected code"));

    const { completeXeroOAuthCallback } = await import("./service");
    await expect(completeXeroOAuthCallback({
      code: "code-1",
      state: "callback-state",
      currentUserId: "user-1",
    })).rejects.toMatchObject({
      code: "xero_callback_token_exchange_failed",
      correlationId: "correlation-1",
    });
    expect(state.organization_xero_oauth_states[0]?.status).toBe("failed");
    expect(state.organization_xero_oauth_states[0]?.failure_code).toBe("xero_callback_token_exchange_failed");
    expect(state.organization_xero_connections[0]?.status).toBe("attention_required");
  });

  it("rejects a superseded callback before token exchange", async () => {
    const state = {
      organization_xero_connections: [{ id: "conn-1", organization_id: "org-1", status: "pending_authorization" }],
      organization_xero_connection_secrets: [],
      organization_xero_oauth_states: [{
        id: "attempt-1",
        organization_id: "org-1",
        user_id: "user-1",
        connection_id: "conn-1",
        correlation_id: "correlation-1",
        state_hash: "hash:callback-state",
        redirect_path: "/app/settings/integrations",
        expires_at: "2099-01-01T00:00:00.000Z",
        used_at: null,
        status: "cancelled",
        created_at: "2026-08-01T00:00:00.000Z",
      }],
      organization_members: [],
    };
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { completeXeroOAuthCallback } = await import("./service");
    await expect(completeXeroOAuthCallback({
      code: "code-1",
      state: "callback-state",
      currentUserId: "user-1",
    })).rejects.toMatchObject({ code: "xero_callback_state_superseded" });
    expect(exchangeXeroAuthorizationCode).not.toHaveBeenCalled();
  });

  it("reloads the latest secret when a stale compare-and-swap refresh write loses the race", async () => {
    const state = {
      organization_xero_connections: [
        {
          id: "conn-1",
          organization_id: "org-1",
          status: "connected",
          token_expires_at: "2020-01-01T00:00:00.000Z",
          refresh_token_expires_at: "2099-01-01T00:00:00.000Z",
          scope: [],
          last_error: null,
          last_health_status: "healthy",
          last_health_checked_at: null,
        },
      ],
      organization_xero_connection_secrets: [
        {
          connection_id: "conn-1",
          encrypted_token_set: JSON.stringify({
            access_token: "latest-access",
            refresh_token: "latest-refresh",
            scope: [],
          }),
          encryption_version: 1,
          updated_at: "2026-07-15T07:05:00.000Z",
        },
      ],
      organization_xero_oauth_states: [],
      organization_members: [],
    };

    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state, { simulateSecretCasMiss: true }));
    refreshXeroToken.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 1800,
      scope: [],
    });

    const { getFreshXeroAccessToken } = await import("./service");
    const result = await getFreshXeroAccessToken("org-1");

    expect(result.tokenSet.access_token).toBe("latest-access");
    expect(result.tokenSet.refresh_token).toBe("latest-refresh");
  });

  it("never exposes framework control-flow or unexpected raw errors as legacy integration feedback", async () => {
    const { getSafeLegacyIntegrationError } = await import("./service");

    expect(getSafeLegacyIntegrationError("NEXT_REDIRECT")).toBe(
      "Unable to complete the Xero integration action. Try again or contact support.",
    );
    expect(getSafeLegacyIntegrationError("NEXT_NOT_FOUND")).not.toContain("NEXT_NOT_FOUND");
    expect(getSafeLegacyIntegrationError("password=secret SQL failed")).not.toContain("password");
    expect(getSafeLegacyIntegrationError("Unable to refresh Xero contacts.")).toBe(
      "Unable to refresh Xero contacts.",
    );
  });
});
