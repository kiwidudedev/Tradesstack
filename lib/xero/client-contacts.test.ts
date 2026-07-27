import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();
const createXeroContacts = vi.fn();
const getFreshXeroAccessToken = vi.fn();
const getOrganizationXeroConnection = vi.fn();

class MockXeroRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/xero/client", () => ({ createXeroContacts, XeroRequestError: MockXeroRequestError }));
vi.mock("@/lib/xero/service", () => ({ getFreshXeroAccessToken, getOrganizationXeroConnection }));
vi.mock("@/lib/xero/contacts", () => ({
  normalizeXeroContact: (contact: Record<string, unknown> | null) => contact?.ContactID
    ? {
        contact_id: contact.ContactID,
        name: contact.Name ?? "Created client",
        first_name: contact.FirstName ?? null,
        last_name: contact.LastName ?? null,
        email: contact.EmailAddress ?? null,
        phone: null,
        mobile: null,
        account_number: null,
        tax_number: null,
        contact_status: contact.ContactStatus ?? "ACTIVE",
        is_supplier: false,
        is_customer: true,
        external_updated_at: null,
        addresses_json: [],
        phones_json: [],
        raw_metadata: contact,
      }
    : null,
}));

type Row = Record<string, unknown>;
type State = Record<string, Row[]>;

function createAdminClient(state: State) {
  let sequence = 0;
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let mode: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Row | Row[] | null = null;
      let single = false;
      let limit: number | null = null;
      let conflict = "";
      const builder = {
        select() { return builder; },
        insert(value: Row | Row[]) { mode = "insert"; payload = value; return builder; },
        update(value: Row) { mode = "update"; payload = value; return builder; },
        upsert(value: Row | Row[], options?: { onConflict?: string }) {
          mode = "upsert";
          payload = value;
          conflict = options?.onConflict ?? "";
          return builder;
        },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
        in(field: string, values: unknown[]) { filters.push((row) => values.includes(row[field])); return builder; },
        order() { return builder; },
        limit(value: number) { limit = value; return builder; },
        maybeSingle() { single = true; return execute(); },
        single() { single = true; return execute(); },
        then(resolve: (result: { data: unknown; error: null }) => unknown) { return execute().then(resolve); },
      };
      function rows() {
        const result = (state[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return limit === null ? result : result.slice(0, limit);
      }
      async function execute() {
        state[table] ??= [];
        if (mode === "select") {
          const result = rows();
          return { data: single ? (result[0] ?? null) : result, error: null };
        }
        if (mode === "update") {
          const result = rows();
          result.forEach((row) => Object.assign(row, payload));
          return { data: single ? (result[0] ?? null) : result, error: null };
        }
        const incoming: Row[] = (Array.isArray(payload) ? payload : [payload!]).map((row): Row => ({
          id: row.id ?? `${table}-${++sequence}`,
          created_at: row.created_at ?? "2026-07-22T00:00:00.000Z",
          ...row,
        }));
        if (mode === "insert") {
          state[table].push(...incoming);
          return { data: single ? incoming[0] : incoming, error: null };
        }
        const keys = conflict.split(",").filter(Boolean);
        incoming.forEach((row) => {
          const existing = state[table].find((candidate) => keys.every((key) => candidate[key] === row[key]));
          if (existing) Object.assign(existing, row);
          else state[table].push(row);
        });
        return { data: single ? incoming[0] : incoming, error: null };
      }
      return builder;
    },
  };
}

function contact(overrides: Row = {}): Row {
  return {
    id: "imported-1",
    organization_id: "org-1",
    connection_id: "conn-1",
    tenant_id: "tenant-1",
    contact_id: "xero-contact-1",
    name: "Acme Developments",
    email: "accounts@acme.example",
    phone: "09 555 0100",
    mobile: null,
    account_number: null,
    contact_status: "ACTIVE",
    is_supplier: false,
    is_customer: true,
    ...overrides,
  };
}

function baseState(): State {
  return {
    organization_clients: [{
      id: "client-1",
      organization_id: "org-1",
      name: "Alex Buyer",
      company_name: "Acme Developments",
      first_name: "Alex",
      last_name: "Buyer",
      email: "accounts@acme.example",
      phone: "09 555 0100",
      payment_terms_days: 20,
    }],
    organization_client_locations: [{
      id: "location-1",
      organization_id: "org-1",
      client_id: "client-1",
      is_primary: true,
      sort_order: 0,
      address_line_1: "12 Queen Street",
      city: "Auckland",
      region: "Auckland",
      postal_code: "1010",
      country: "NZ",
    }],
    organization_xero_contacts: [contact()],
    organization_external_contacts: [],
    organization_external_contact_operations: [],
    project_claims: [{ id: "claim-1", organization_id: "org-1", project_id: "project-1" }],
    organization_projects: [{ id: "project-1", organization_id: "org-1", client_id: "client-1" }],
  };
}

describe("client to Xero Contact linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationXeroConnection.mockResolvedValue({
      id: "conn-1",
      status: "connected",
      tenant_id: "tenant-1",
      last_contacts_sync_at: "2026-07-22T00:00:00.000Z",
    });
    getFreshXeroAccessToken.mockResolvedValue({ tokenSet: { access_token: "token" } });
  });

  it("resolves the client through claim to project to organization client", async () => {
    const state = baseState();
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { resolveProjectClaimClientForXeroContact } = await import("./client-contacts");
    await expect(resolveProjectClaimClientForXeroContact({ organizationId: "org-1", projectClaimId: "claim-1" }))
      .resolves.toEqual({ projectClaimId: "claim-1", projectId: "project-1", clientId: "client-1" });
  });

  it("links using the imported row id while resolving ContactID server-side", async () => {
    const state = baseState();
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { linkClientToImportedXeroContact } = await import("./client-contacts");
    await linkClientToImportedXeroContact({
      organizationId: "org-1", clientId: "client-1", importedContactId: "imported-1",
      actorUserId: "user-1", matchMethod: "manual_search",
    });
    expect(state.organization_external_contacts[0]).toMatchObject({
      organization_id: "org-1",
      accounting_connection_id: "conn-1",
      tenant_id: "tenant-1",
      local_entity_type: "client",
      local_entity_id: "client-1",
      external_contact_id: "xero-contact-1",
      link_status: "linked",
    });
  });

  it("unlinks an active client link", async () => {
    const state = baseState();
    state.organization_external_contacts.push({
      id: "link-1", organization_id: "org-1", accounting_connection_id: "conn-1", provider: "xero",
      tenant_id: "tenant-1", local_entity_type: "client", local_entity_id: "client-1",
      external_contact_id: "xero-contact-1", link_status: "linked",
    });
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { unlinkClientXeroContact } = await import("./client-contacts");
    await unlinkClientXeroContact({ organizationId: "org-1", clientId: "client-1" });
    expect(state.organization_external_contacts[0]).toMatchObject({
      link_status: "unlinked_history",
    });
  });

  it("relinks an active link and preserves its history", async () => {
    const state = baseState();
    state.organization_xero_contacts.push(contact({ id: "imported-2", contact_id: "xero-contact-2", name: "Acme New" }));
    state.organization_external_contacts.push({
      id: "link-1", organization_id: "org-1", accounting_connection_id: "conn-1", provider: "xero",
      tenant_id: "tenant-1", local_entity_type: "client", local_entity_id: "client-1",
      external_contact_id: "xero-contact-1", link_status: "linked",
    });
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { linkClientToImportedXeroContact } = await import("./client-contacts");
    await linkClientToImportedXeroContact({
      organizationId: "org-1", clientId: "client-1", importedContactId: "imported-2",
      actorUserId: "user-1", allowRelink: true, matchMethod: "manual_relink",
    });
    expect(state.organization_external_contacts[0]).toMatchObject({
      link_status: "unlinked_history",
      superseded_by_id: state.organization_external_contacts[1].id,
    });
    expect(state.organization_external_contacts.at(-1)).toMatchObject({ external_contact_id: "xero-contact-2", link_status: "linked" });
    expect(state.organization_external_contacts.every((row) => row.local_entity_type === "client")).toBe(true);
  });

  it("builds create data from the saved client and primary address", async () => {
    const { buildCreateContactPayloadFromClient } = await import("./client-contacts");
    const state = baseState();
    expect(buildCreateContactPayloadFromClient(
      state.organization_clients[0] as never,
      state.organization_client_locations[0] as never,
    )).toMatchObject({
      Name: "Acme Developments",
      FirstName: "Alex",
      LastName: "Buyer",
      EmailAddress: "accounts@acme.example",
      Phones: [{ PhoneNumber: "09 555 0100" }],
      Addresses: [{ AddressLine1: "12 Queen Street", City: "Auckland", Country: "NZ" }],
      PaymentTerms: { Sales: { Type: "DAYSAFTERBILLDATE", Day: 20 } },
    });
  });

  it.each([
    ["cross-organization client", (state: State) => { state.organization_clients[0].organization_id = "org-2"; }],
    ["tenant mismatch", (state: State) => { state.organization_xero_contacts[0].tenant_id = "tenant-2"; }],
    ["connection mismatch", (state: State) => { state.organization_xero_contacts[0].connection_id = "conn-2"; }],
    ["archived Contact", (state: State) => { state.organization_xero_contacts[0].contact_status = "ARCHIVED"; }],
  ])("rejects %s", async (_label, mutate) => {
    const state = baseState();
    mutate(state);
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { linkClientToImportedXeroContact } = await import("./client-contacts");
    await expect(linkClientToImportedXeroContact({
      organizationId: "org-1", clientId: "client-1", importedContactId: "imported-1",
      actorUserId: "user-1", matchMethod: "manual_search",
    })).rejects.toThrow();
    expect(state.organization_external_contacts).toHaveLength(0);
  });

  it("handles duplicate active-link conflicts safely", async () => {
    const state = baseState();
    state.organization_clients.push({ ...state.organization_clients[0], id: "client-2", name: "Other", company_name: "Other" });
    state.organization_external_contacts.push({
      id: "link-other", organization_id: "org-1", accounting_connection_id: "conn-1", provider: "xero",
      tenant_id: "tenant-1", local_entity_type: "client", local_entity_id: "client-2",
      external_contact_id: "xero-contact-1", link_status: "linked",
    });
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    const { linkClientToImportedXeroContact } = await import("./client-contacts");
    await expect(linkClientToImportedXeroContact({
      organizationId: "org-1", clientId: "client-1", importedContactId: "imported-1",
      actorUserId: "user-1", matchMethod: "manual_search",
    })).rejects.toThrow("already linked to another client");
    expect(state.organization_external_contacts).toHaveLength(1);
  });

  it("retries uncertain creation idempotently with the same Xero idempotency key", async () => {
    const state = baseState();
    state.organization_xero_contacts = [];
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(state));
    createXeroContacts
      .mockRejectedValueOnce(new Error("network outcome unknown"))
      .mockResolvedValueOnce([{ ContactID: "created-contact", Name: "Acme Developments", ContactStatus: "ACTIVE" }]);
    const { createAndLinkXeroContactFromClient } = await import("./client-contacts");
    const params = {
      organizationId: "org-1", clientId: "client-1", actorUserId: "user-1", allowPotentialDuplicate: true,
    };
    await expect(createAndLinkXeroContactFromClient(params)).rejects.toThrow("unexpected response");
    expect(state.organization_external_contact_operations[0].status).toBe("uncertain");
    await expect(createAndLinkXeroContactFromClient(params)).resolves.toMatchObject({ ok: true });
    expect(state.organization_external_contact_operations).toHaveLength(1);
    expect(createXeroContacts.mock.calls[0][0].idempotencyKey).toBe(createXeroContacts.mock.calls[1][0].idempotencyKey);
    expect(state.organization_external_contacts.at(-1)).toMatchObject({
      local_entity_type: "client", external_contact_id: "created-contact", link_status: "linked",
    });
  });
});
