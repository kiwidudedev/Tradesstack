import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  member: vi.fn(), permission: vi.fn(), client: vi.fn(), comparison: vi.fn(),
  progress: vi.fn(), document: vi.fn(), readiness: vi.fn(), workflow: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.member }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/lib/procurement-commercial-server", () => ({ getSupplierInvoiceCommercialComparison: mocks.comparison, getPurchaseOrderInvoicingProgress: mocks.progress }));
vi.mock("@/lib/supplier-invoice-document-service", () => ({ loadSupplierInvoiceDocumentState: mocks.document }));
vi.mock("@/lib/xero/bills", () => ({ getSupplierInvoiceXeroBillReadiness: mocks.readiness }));
vi.mock("@/lib/supplier-invoice-workflow", () => ({ getSupplierInvoiceWorkflowState: mocks.workflow }));
vi.mock("@/app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace", () => ({ SupplierInvoiceDetailWorkspace: () => null }));
import Page from "@/app/app/(workspace)/company/supplier-invoices/[invoiceId]/page";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let tableError: string | null;
let queried: string[];
const scope = { organization_id: "org-fixture" };
const route = (id: string, project: string | null, code: string): Row => ({ ...scope, id, project_id: project, provider: "xero", accounting_route: "supplier_bill_expense", organization_cost_code_id: code, is_active: true, updated_at: "2026-08-24T00:00:00Z" });
const account = (id: string, tenant: string, active = true): Row => ({ ...scope, id, code: id, name: id, external_provider: "xero", metadata: { tenantId: tenant }, is_active: active });
function from(table: string) {
  queried.push(table);
  const filters: Array<(r: Row) => boolean> = [];
  let single = false;
  const query = {
    select: () => query, order: () => query,
    eq: (key: string, value: unknown) => { filters.push(r => r[key] === value); return query; },
    in: (key: string, values: unknown[]) => { filters.push(r => values.includes(r[key])); return query; },
    maybeSingle: () => { single = true; return query; },
    then: (resolve: (v: { data: Row[] | Row | null; error: { message: string } | null }) => unknown) => {
      const rows = (tables[table] ?? []).filter(r => filters.every(filter => filter(r)));
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: table === tableError ? { message: "Fixture read failure" } : null }).then(resolve);
    },
  };
  return query;
}
async function props() {
  const result = await Page({ params: Promise.resolve({ invoiceId: "invoice-fixture" }) });
  if (!result) throw new Error("Expected invoice workspace");
  return result.props;
}
beforeEach(() => {
  vi.resetAllMocks(); queried = []; tableError = null;
  mocks.member.mockResolvedValue({ organization_id: scope.organization_id, role: "owner" });
  mocks.permission.mockResolvedValue(true);
  mocks.client.mockResolvedValue({ from });
  mocks.comparison.mockResolvedValue({ warnings: [] });
  mocks.progress.mockResolvedValue({});
  mocks.document.mockResolvedValue({ currentDocument: null, extraction: null });
  mocks.workflow.mockResolvedValue({});
  mocks.readiness.mockResolvedValue({ resolvedSummary: { tenantId: "tenant-current", exportStatus: "not_exported" } });
  tables = {
    supplier_invoices: [{ ...scope, id: "invoice-fixture" }],
    supplier_invoice_lines: [{ ...scope, id: "invoice-line", supplier_invoice_id: "invoice-fixture", project_id: "project-fixture", description: "Timber", line_total: 100, quantity: 1 }],
    supplier_invoice_purchase_order_matches: [{ ...scope, supplier_invoice_id: "invoice-fixture", purchase_order_id: "po-fixture", match_status: "accepted" }],
    project_purchase_orders: [{ ...scope, id: "po-fixture", project_id: "project-fixture" }],
    project_purchase_order_line_items: [{ ...scope, id: "po-line", purchase_order_id: "po-fixture", project_id: "project-fixture", description: "Timber", total: 100, quantity: 1, cost_item_id: null, source_cost_item_id: null }],
    organization_cost_codes: [account("expense-org", "tenant-current"), account("expense-project", "tenant-current"), account("old-tenant", "tenant-old"), account("inactive", "tenant-current", false)],
    organization_accounting_route_mappings: [route("route-org", null, "expense-org"), route("route-project", "project-fixture", "expense-project"), { ...route("foreign-org", null, "old-tenant"), organization_id: "another-org" }, { ...route("revenue", null, "expense-org"), accounting_route: "payment_claim_revenue" }],
  };
});
describe("supplier invoice canonical page accounting contract", () => {
  it("uses the project Supplier Bills route without requiring construction classification", async () => {
    const result = await props();
    expect(result.allocationPreviewRows[0]).toMatchObject({ organizationCostCodeId: "expense-project", accountingResolutionStatus: "resolved", status: "Ready", tradesstackCostCode: null });
    expect(queried).toContain("organization_accounting_route_mappings");
    expect(queried).not.toContain("organization_tradesstack_accounting_mappings");
    expect(result.accountingMappings.map((m: { id: string }) => m.id)).not.toContain("foreign-org");
    expect(result.accountingMappings.map((m: { id: string }) => m.id)).not.toContain("revenue");
  });
  it("falls back to the organization Supplier Bills route", async () => {
    tables.organization_accounting_route_mappings = [route("route-org", null, "expense-org")];
    expect((await props()).allocationPreviewRows[0]).toMatchObject({ organizationCostCodeId: "expense-org", status: "Ready" });
  });
  it("shows accounting setup required when no named mapping exists", async () => {
    tables.organization_accounting_route_mappings = [];
    expect((await props()).allocationPreviewRows[0]).toMatchObject({ organizationCostCodeId: null, status: "Needs accounting mapping" });
  });
  it("offers explicit current-tenant active Xero accounts using the existing action prefix", async () => {
    const ids = (await props()).accountingMappings.map((m: { id: string }) => m.id);
    expect(ids).toContain("account:expense-org");
    expect(ids).not.toContain("account:old-tenant");
    expect(ids).not.toContain("account:inactive");
  });
  it("retains the no-PO preview behavior", async () => {
    tables.supplier_invoice_purchase_order_matches = [];
    expect((await props()).allocationPreviewRows[0]).toMatchObject({ status: "No PO line candidate", candidatePurchaseOrderLineItemId: null });
  });
  it("does not create a client when view permission is denied", async () => {
    mocks.permission.mockImplementation(async (_org: string, permission: string) => permission !== "supplier_invoices.view");
    expect(await Page({ params: Promise.resolve({ invoiceId: "invoice-fixture" }) })).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("retains not-found handling", async () => {
    tables.supplier_invoices = [];
    await expect(props()).rejects.toThrow("NOT_FOUND");
  });
  it("surfaces named-mapping read failures", async () => {
    tableError = "organization_accounting_route_mappings";
    await expect(props()).rejects.toThrow("Fixture read failure");
  });
});
