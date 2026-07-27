import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();
const createXeroContacts = vi.fn();
const getFreshXeroAccessToken = vi.fn();
const getOrganizationXeroConnection = vi.fn();

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

vi.mock("@/lib/xero/client", () => ({
  createXeroContacts,
  getXeroContacts: vi.fn(),
  XeroRequestError: MockXeroRequestError,
}));

vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken,
  getOrganizationXeroConnection,
}));

type TableState = {
  organization_suppliers: Array<Record<string, unknown>>;
  organization_xero_contacts: Array<Record<string, unknown>>;
  organization_external_contacts: Array<Record<string, unknown>>;
  organization_external_contact_operations: Array<Record<string, unknown>>;
  supplier_contact_link_activity: Array<Record<string, unknown>>;
  organization_accounting_sync_jobs: Array<Record<string, unknown>>;
};

function createAdminClient(state: TableState) {
  let sequence = 1;

  function nextId(prefix: string) {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function matchesFilters(row: Record<string, unknown>, filters: Array<(row: Record<string, unknown>) => boolean>) {
    return filters.every((filter) => filter(row));
  }

  return {
    from(table: keyof TableState) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let mode: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Array<Record<string, unknown>> | Record<string, unknown> | null = null;
      let limitCount: number | null = null;
      let countMode: "exact" | null = null;
      let head = false;
      let singleMode: "single" | "maybeSingle" | null = null;
      let orderField: string | null = null;
      let orderAscending = true;
      let conflictKey: string | null = null;

      const builder = {
        select(_columns?: string, options?: { count?: "exact"; head?: boolean }) {
          countMode = options?.count ?? null;
          head = options?.head ?? false;
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
        upsert(value: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string }) {
          mode = "upsert";
          payload = Array.isArray(value) ? value : [value];
          conflictKey = options?.onConflict ?? null;
          return builder;
        },
        eq(field: string, value: unknown) {
          filters.push((row) => row[field] === value);
          return builder;
        },
        in(field: string, values: unknown[]) {
          filters.push((row) => values.includes(row[field]));
          return builder;
        },
        order(field: string, options?: { ascending?: boolean }) {
          orderField = field;
          orderAscending = options?.ascending ?? true;
          return builder;
        },
        limit(value: number) {
          limitCount = value;
          return builder;
        },
        maybeSingle() {
          singleMode = "maybeSingle";
          return execute();
        },
        single() {
          singleMode = "single";
          return execute();
        },
        then(onFulfilled: (value: { data: unknown; error: null; count: number | null }) => unknown) {
          return execute().then(onFulfilled);
        },
      };

      function readRows() {
        let rows = [...state[table]].filter((row) => matchesFilters(row, filters));
        if (orderField) {
          rows.sort((left, right) => {
            const leftValue = left[orderField!];
            const rightValue = right[orderField!];
            const result = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
            return orderAscending ? result : -result;
          });
        }
        if (limitCount != null) {
          rows = rows.slice(0, limitCount);
        }
        return rows;
      }

      async function execute() {
        if (mode === "select") {
          const rows = readRows();
          const data =
            singleMode === "single" || singleMode === "maybeSingle"
              ? (rows[0] ?? null)
              : (head ? null : rows);
          return {
            data,
            error: null,
            count: countMode === "exact" ? rows.length : null,
          };
        }

        if (mode === "insert") {
          const rowsToInsert = (Array.isArray(payload) ? payload : []).map((row) => ({
            id: row.id ?? nextId(String(table)),
            created_at: row.created_at ?? "2026-07-16T00:00:00.000Z",
            updated_at: row.updated_at ?? "2026-07-16T00:00:00.000Z",
            ...row,
          }));
          state[table].push(...rowsToInsert);
          return {
            data:
              singleMode === "single" || singleMode === "maybeSingle"
                ? (rowsToInsert[0] ?? null)
                : rowsToInsert,
            error: null,
            count: null,
          };
        }

        if (mode === "update") {
          const updatePayload = payload && !Array.isArray(payload) ? payload : {};
          const rows = state[table].filter((row) => matchesFilters(row, filters));
          rows.forEach((row) => Object.assign(row, updatePayload));
          return {
            data:
              singleMode === "single" || singleMode === "maybeSingle"
                ? (rows[0] ?? null)
                : rows,
            error: null,
            count: null,
          };
        }

        const rowsToUpsert = Array.isArray(payload) ? payload : [];
        const conflictFields = (conflictKey ?? "")
          .split(",")
          .map((field) => field.trim())
          .filter(Boolean);

        for (const row of rowsToUpsert) {
          const existing = state[table].find((candidate) =>
            conflictFields.length > 0
              ? conflictFields.every((field) => candidate[field] === row[field])
              : candidate.id === row.id,
          );
          if (existing) {
            Object.assign(existing, row);
            continue;
          }
          state[table].push({
            id: row.id ?? nextId(String(table)),
            created_at: row.created_at ?? "2026-07-16T00:00:00.000Z",
            updated_at: row.updated_at ?? "2026-07-16T00:00:00.000Z",
            ...row,
          });
        }

        return {
          data:
            singleMode === "single" || singleMode === "maybeSingle"
              ? (readRows()[0] ?? null)
              : rowsToUpsert,
          error: null,
          count: null,
        };
      }

      return builder;
    },
  };
}

function createBaseState() {
  return {
    organization_suppliers: [
      {
        id: "supplier-1",
        organization_id: "org-1",
        name: "Sample Supplier",
        company_name: "Sample Supplier",
        legal_name: "Sample Supplier Ltd",
        email: "supplier@example.test",
        phone: "0800 100 590",
        address: "11c Airbourne Road",
        is_active: true,
      },
    ] as Array<Record<string, unknown>>,
    organization_xero_contacts: [] as Array<Record<string, unknown>>,
    organization_external_contacts: [] as Array<Record<string, unknown>>,
    organization_external_contact_operations: [] as Array<Record<string, unknown>>,
    supplier_contact_link_activity: [] as Array<Record<string, unknown>>,
    organization_accounting_sync_jobs: [] as Array<Record<string, unknown>>,
  } satisfies TableState;
}

describe("createAndLinkXeroContactFromSupplier", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getOrganizationXeroConnection.mockResolvedValue({
      id: "conn-1",
      status: "connected",
      tenant_id: "tenant-1",
      tenant_name: "Tradesstack TEST",
      last_contacts_sync_at: "2026-07-16T00:00:00.000Z",
    });
    getFreshXeroAccessToken.mockResolvedValue({
      connection: {
        id: "conn-1",
        status: "connected",
        tenant_id: "tenant-1",
      },
      tokenSet: {
        access_token: "access-token",
      },
    });
  });

  it("creates the Xero contact, caches it, links the supplier, and records activity", async () => {
    const state = createBaseState();
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    createXeroContacts.mockResolvedValue([
      {
        ContactID: "contact-1",
        Name: "Sample Supplier Ltd",
        EmailAddress: "supplier@example.test",
        ContactStatus: "ACTIVE",
        Phones: [{ PhoneType: "DEFAULT", PhoneNumber: "0800 100 590" }],
      },
    ]);

    const { createAndLinkXeroContactFromSupplier } = await import("./contacts");
    const result = await createAndLinkXeroContactFromSupplier({
      organizationId: "org-1",
      supplierId: "supplier-1",
      actorUserId: "user-1",
      allowPotentialDuplicate: true,
    });

    expect(result).toEqual({
      ok: true,
      linkId: expect.any(String),
      contactId: "contact-1",
    });
    expect(state.organization_xero_contacts).toHaveLength(1);
    expect(state.organization_xero_contacts[0]).toMatchObject({
      organization_id: "org-1",
      connection_id: "conn-1",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      name: "Sample Supplier Ltd",
    });
    expect(state.organization_external_contacts).toHaveLength(1);
    expect(state.organization_external_contacts[0]).toMatchObject({
      organization_id: "org-1",
      local_entity_id: "supplier-1",
      external_contact_id: "contact-1",
      link_status: "linked",
      match_method: "manual_create",
    });
    expect(state.organization_external_contact_operations).toHaveLength(1);
    expect(state.organization_external_contact_operations[0]).toMatchObject({
      status: "succeeded",
      external_contact_id: "contact-1",
    });
    expect(state.supplier_contact_link_activity).toHaveLength(2);
    expect(state.supplier_contact_link_activity.map((entry) => String(entry.action))).toEqual([
      "supplier_linked",
      "xero_contact_created",
    ]);
  });

  it("uses a new idempotency key when supplier details change after a failed attempt", async () => {
    const state = createBaseState();
    state.organization_suppliers[0] = {
      ...state.organization_suppliers[0],
      email: "supplier@example.test",
    };
    state.organization_external_contact_operations.push({
      id: "operation-1",
      organization_id: "org-1",
      accounting_connection_id: "conn-1",
      provider: "xero",
      local_entity_type: "supplier",
      local_entity_id: "supplier-1",
      tenant_id: "tenant-1",
      operation_type: "create_contact",
      operation_key: "xero:create-contact:org-1:tenant-1:supplier-1",
      status: "failed",
      request_summary: {
        email: "invalid-email",
      },
      response_summary: {},
      error_code: "xero_validation",
      error_message: "Email address is invalid.",
    });

    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    createXeroContacts.mockResolvedValue([
      {
        ContactID: "contact-2",
        Name: "Sample Supplier Ltd",
        EmailAddress: "supplier@example.test",
        ContactStatus: "ACTIVE",
      },
    ]);

    const oldIdempotencyKey = createHash("sha256")
      .update("xero:create-contact:org-1:tenant-1:supplier-1")
      .digest("hex")
      .slice(0, 64);

    const { createAndLinkXeroContactFromSupplier } = await import("./contacts");
    await createAndLinkXeroContactFromSupplier({
      organizationId: "org-1",
      supplierId: "supplier-1",
      actorUserId: "user-1",
      allowPotentialDuplicate: true,
    });

    expect(createXeroContacts).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.any(String),
    }));
    expect(createXeroContacts.mock.calls[0]?.[0]?.idempotencyKey).not.toBe(oldIdempotencyKey);
    expect(state.organization_external_contact_operations).toHaveLength(2);
  });

  it("stores and returns a safe provider validation message instead of the generic contacts-load error", async () => {
    const state = createBaseState();
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    createXeroContacts.mockRejectedValue(
      new MockXeroRequestError("Contact already exists.", { status: 400 }),
    );

    const { createAndLinkXeroContactFromSupplier } = await import("./contacts");

    await expect(
      createAndLinkXeroContactFromSupplier({
        organizationId: "org-1",
        supplierId: "supplier-1",
        actorUserId: "user-1",
        allowPotentialDuplicate: true,
      }),
    ).rejects.toThrow("Contact already exists.");

    expect(state.organization_external_contact_operations).toHaveLength(1);
    expect(state.organization_external_contact_operations[0]).toMatchObject({
      status: "failed",
      error_code: "xero_validation",
      error_message: "Contact already exists.",
    });
  });
});
