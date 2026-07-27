import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getCurrentOrganizationMember: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "font", variable: "font-variable" },
}));
vi.mock("@/lib/permissions-server", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.getCurrentOrganizationMember }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("@/components/app/OperationalEmptyState", () => ({
  OperationalEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/app/OperationalKpiCard", () => ({
  OperationalKpiCard: ({ label, value, helper }: { label: string; value: ReactNode; helper?: string }) => (
    <div><span>{label}</span><span>{value}</span>{helper ? <span>{helper}</span> : null}</div>
  ),
}));
vi.mock("@/components/app/OperationalModuleHeader", () => ({
  OperationalModuleHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => <header>{title}{actions}</header>,
}));
vi.mock("@/components/app/OperationalPanel", () => ({
  OperationalPanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/app/OperationalTable", () => ({
  OperationalTable: ({ children }: { children: ReactNode }) => <table>{children}</table>,
  OperationalTableBody: ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>,
  OperationalTableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
  OperationalTableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
  OperationalTableHeader: ({ children }: { children: ReactNode }) => <thead>{children}</thead>,
  OperationalTableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));
vi.mock("@/components/app/StatusBadge", () => ({
  StatusBadge: ({ status, children }: { status: string; children: ReactNode }) => (
    <span data-status={status}>{children}</span>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));
vi.mock("./AddClientDialog", () => ({ AddClientDialog: () => null }));
vi.mock("./CopyableClientContact", () => ({
  CopyableClientContact: ({ value, children }: { value: string; children: ReactNode }) => <span>{children}{value}</span>,
}));

import ClientsPage from "./page";

type Row = Record<string, unknown>;
type State = Record<string, Row[]>;

function client(id: string, companyName: string, name = `${companyName} Contact`): Row {
  return { id, organization_id: "org-1", name, company_name: companyName, email: null, phone: null, created_at: `2026-01-${id.padStart(2, "0")}T00:00:00.000Z` };
}

function baseState(): State {
  return {
    organization_clients: [client("1", "Alpha Client")],
    organization_projects: [],
    organization_opportunities: [],
    organization_xero_connections: [{ id: "connection-1", organization_id: "org-1", status: "connected", tenant_id: "tenant-1" }],
    organization_external_contacts: [{
      organization_id: "org-1",
      provider: "xero",
      local_entity_type: "client",
      local_entity_id: "1",
      link_status: "linked",
      accounting_connection_id: "connection-1",
      tenant_id: "tenant-1",
      external_contact_id: "contact-1",
    }],
    organization_xero_contacts: [{
      organization_id: "org-1",
      connection_id: "connection-1",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      contact_status: "ACTIVE",
    }],
  };
}

function createSupabase(state: State, failingTables: string[] = []) {
  const executions: string[] = [];
  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const execute = async (single = false) => {
      executions.push(table);
      if (failingTables.includes(table)) {
        return { data: single ? null : [], error: { message: `${table} failed` } };
      }
      const rows = (state[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(() => execute(true)),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => execute().then(resolve, reject),
    };
    return builder;
  });
  return { client: { from }, executions };
}

async function renderPage(state: State, searchParams: Record<string, string> = {}, failingTables: string[] = []) {
  const database = createSupabase(state, failingTables);
  mocks.createServerSupabaseClient.mockResolvedValue(database.client);
  const element = await ClientsPage({ searchParams: Promise.resolve(searchParams) });
  return { markup: renderToStaticMarkup(element), executions: database.executions, from: database.client.from };
}

function renderedRows(markup: string) {
  return markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
}

describe("Clients register Xero status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentOrganizationMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
  });

  it("renders Active only for a linked client with an ACTIVE imported Contact in the current context", async () => {
    const { markup } = await renderPage(baseState());
    expect(markup).toContain("<th>Xero</th>");
    expect(markup).toContain('<span data-status="approved">Active</span>');
    expect(markup).not.toContain("<th>Status</th>");
  });

  it.each([
    ["unlinked client", (state: State) => { state.organization_external_contacts = []; }],
    ["external_archived link", (state: State) => { state.organization_external_contacts[0].link_status = "external_archived"; }],
    ["attention_required link", (state: State) => { state.organization_external_contacts[0].link_status = "attention_required"; }],
    ["unlinked_history link", (state: State) => { state.organization_external_contacts[0].link_status = "unlinked_history"; }],
    ["ARCHIVED imported Contact", (state: State) => { state.organization_xero_contacts[0].contact_status = "ARCHIVED"; }],
    ["GDPRREQUEST imported Contact", (state: State) => { state.organization_xero_contacts[0].contact_status = "GDPRREQUEST"; }],
    ["missing imported Contact", (state: State) => { state.organization_xero_contacts = []; }],
    ["wrong link tenant", (state: State) => { state.organization_external_contacts[0].tenant_id = "tenant-2"; }],
    ["wrong link connection", (state: State) => { state.organization_external_contacts[0].accounting_connection_id = "connection-2"; }],
    ["wrong link organization", (state: State) => { state.organization_external_contacts[0].organization_id = "org-2"; }],
    ["non-client entity", (state: State) => { state.organization_external_contacts[0].local_entity_type = "supplier"; }],
    ["wrong imported Contact tenant", (state: State) => { state.organization_xero_contacts[0].tenant_id = "tenant-2"; }],
    ["wrong imported Contact connection", (state: State) => { state.organization_xero_contacts[0].connection_id = "connection-2"; }],
    ["wrong imported Contact organization", (state: State) => { state.organization_xero_contacts[0].organization_id = "org-2"; }],
  ])("renders Not Active for %s", async (_label, mutate) => {
    const state = baseState();
    mutate(state);
    const { markup } = await renderPage(state);
    expect(markup).toContain('<span data-status="overdue">Not Active</span>');
    expect(markup).not.toContain('<span data-status="approved">Active</span>');
  });

  it.each([
    ["disconnected connection", { status: "disconnected", tenant_id: "tenant-1" }],
    ["missing tenant", { status: "connected", tenant_id: null }],
  ])("fails closed for %s without querying links or Contacts", async (_label, connection) => {
    const state = baseState();
    Object.assign(state.organization_xero_connections[0], connection);
    const { markup, executions } = await renderPage(state);
    expect(markup).toContain('<span data-status="overdue">Not Active</span>');
    expect(executions).not.toContain("organization_external_contacts");
    expect(executions).not.toContain("organization_xero_contacts");
  });

  it.each(["organization_xero_connections", "organization_external_contacts", "organization_xero_contacts"])(
    "fails closed when the %s query fails while retaining the register",
    async (table) => {
      const { markup } = await renderPage(baseState(), {}, [table]);
      expect(markup).toContain("Alpha Client");
      expect(markup).toContain('<span data-status="overdue">Not Active</span>');
      expect(markup).not.toContain(`${table} failed`);
    },
  );

  it("preserves company-name search behavior", async () => {
    const state = baseState();
    state.organization_clients.push(client("2", "Beta Builders", "Alpha Person"));
    const { markup } = await renderPage(state, { clientSearch: "alpha" });
    expect(markup).toContain("Alpha Client");
    expect(markup).not.toContain("Beta Builders");
  });

  it("preserves opportunity-based Active and Inactive filters", async () => {
    const state = baseState();
    state.organization_clients.push(client("2", "Beta Builders"));
    state.organization_opportunities.push({ organization_id: "org-1", client_id: "1", stage: "Tender", estimated_value: 100, updated_at: "2026-01-01" });

    const active = await renderPage(state, { statusFilter: "active" });
    expect(renderedRows(active.markup)).toContain("Alpha Client");
    expect(renderedRows(active.markup)).not.toContain("Beta Builders");

    const inactive = await renderPage(state, { statusFilter: "inactive" });
    expect(renderedRows(inactive.markup)).not.toContain("Alpha Client");
    expect(renderedRows(inactive.markup)).toContain("Beta Builders");
  });

  it("preserves rating order and renders every filtered row without pagination", async () => {
    const state = baseState();
    state.organization_clients = Array.from({ length: 30 }, (_, index) => client(String(index + 1), `Client ${String(index + 1).padStart(2, "0")}`));
    state.organization_opportunities = [{ organization_id: "org-1", client_id: "30", stage: "Tender", estimated_value: 100, updated_at: "2026-01-01" }];
    const { markup } = await renderPage(state);
    expect(markup.indexOf("Client 30")).toBeLessThan(markup.indexOf("Client 01"));
    for (let index = 1; index <= 30; index += 1) {
      expect(markup).toContain(`Client ${String(index).padStart(2, "0")}`);
    }
  });

  it("keeps query count constant as the number of clients increases", async () => {
    const oneClient = await renderPage(baseState());
    const manyState = baseState();
    manyState.organization_clients = Array.from({ length: 75 }, (_, index) => client(String(index + 1), `Client ${index + 1}`));
    const manyClients = await renderPage(manyState);
    expect(oneClient.executions).toHaveLength(6);
    expect(manyClients.executions).toHaveLength(6);
    expect(manyClients.executions.filter((table) => table === "organization_external_contacts")).toHaveLength(1);
    expect(manyClients.executions.filter((table) => table === "organization_xero_contacts")).toHaveLength(1);
  });

  it("does not use claims, pagination, or the Client detail Xero workspace loader", async () => {
    const source = await readFile("app/app/(workspace)/leads-clients/clients/page.tsx", "utf8");
    expect(source).not.toContain('from("project_claims")');
    expect(source).not.toContain("overdueClientIds");
    expect(source).not.toContain("loadClientXeroLinkWorkspaceData");
    expect(source).not.toMatch(/\.range\s*\(/);
  });
});
