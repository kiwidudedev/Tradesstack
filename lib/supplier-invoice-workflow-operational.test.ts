import { describe, expect, it } from "vitest";
import { getSupplierInvoiceWorkflowState } from "@/lib/supplier-invoice-workflow";

type Row = Record<string, unknown>;

function client(tables: Record<string, Row[]>, hashes: { finance: string; operational: string }) {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let single = false;
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return query;
      },
      maybeSingle: () => {
        single = true;
        return query;
      },
      then: (resolve: (value: { data: Row[] | Row | null; error: null }) => unknown) => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve);
      },
    };
    return query;
  };
  const rpc = (name: string) => ({
    data: name === "supplier_invoice_operational_version_hash" ? hashes.operational : hashes.finance,
    error: null,
  });
  return { from, rpc } as never;
}

function fixture(overrides: {
  matches?: Row[];
  submission?: Row | null;
  decisions?: Row[];
  accountsApproval?: Row | null;
  commercialApproval?: Row | null;
  allocations?: Row[];
} = {}) {
  const allocations = overrides.allocations ?? [{
    id: "allocation-1",
    organization_id: "org-1",
    supplier_invoice_id: "invoice-1",
    supplier_invoice_line_id: "line-1",
    purchase_order_id: "po-1",
    purchase_order_line_item_id: "po-line-1",
    allocated_amount: 110,
    allocation_status: "matched",
  }];
  return {
    supplier_invoices: [{
      id: "invoice-1",
      organization_id: "org-1",
      supplier_id: "supplier-1",
      invoice_number: "INV-1",
      invoice_date: "2026-10-03",
      subtotal: 110,
      total: 110,
    }],
    supplier_invoice_lines: [{ id: "line-1", organization_id: "org-1", supplier_invoice_id: "invoice-1", line_total: 110 }],
    supplier_invoice_line_allocations: allocations,
    supplier_invoice_purchase_order_matches: overrides.matches ?? [
      { id: "match-1", organization_id: "org-1", supplier_invoice_id: "invoice-1", purchase_order_id: "po-1", match_status: "accepted" },
    ],
    supplier_invoice_site_review_submissions: overrides.submission ? [overrides.submission] : [],
    supplier_invoice_site_review_decisions: overrides.decisions ?? [],
    supplier_invoice_accounts_approvals: overrides.accountsApproval ? [overrides.accountsApproval] : [],
    supplier_invoice_commercial_approvals: overrides.commercialApproval ? [overrides.commercialApproval] : [],
    organization_accounting_documents: [],
  };
}

describe("Supplier Invoice operational workflow state", () => {
  it("is operationally ready with no accounting route, account or tax treatment", async () => {
    const state = await getSupplierInvoiceWorkflowState({
      supabase: client(fixture(), { finance: "finance-hash", operational: "operational-hash" }),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
    });

    expect(state.siteReviewBlockers).toEqual([]);
    expect(state.financeHash).toBe("finance-hash");
    expect(state.operationalHash).toBe("operational-hash");
    expect(state.status).toBe("Draft");
  });

  it("reports an unmatched Purchase Order as an operational blocker", async () => {
    const state = await getSupplierInvoiceWorkflowState({
      supabase: client(fixture({ matches: [] }), { finance: "finance-hash", operational: "operational-hash" }),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
    });

    expect(state.siteReviewBlockers).toContain("Match a Purchase Order before site review.");
  });

  it("reports a missing allocation as an operational blocker", async () => {
    const state = await getSupplierInvoiceWorkflowState({
      supabase: client(fixture({ allocations: [] }), { finance: "finance-hash", operational: "operational-hash" }),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
    });

    expect(state.siteReviewBlockers).toContain("Allocate every Supplier Invoice line.");
  });

  it("treats a submission as current when its operational hash matches", async () => {
    const state = await getSupplierInvoiceWorkflowState({
      supabase: client(
        fixture({
          submission: {
            id: "submission-1",
            organization_id: "org-1",
            supplier_invoice_id: "invoice-1",
            finance_hash: "finance-hash",
            operational_hash: "operational-hash",
            status: "approved",
          },
          decisions: [{ id: "decision-1", organization_id: "org-1", submission_id: "submission-1", decision: "approved" }],
        }),
        { finance: "finance-hash", operational: "operational-hash" },
      ),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
    });

    expect(state.activeSubmissionId).toBe("submission-1");
    expect(state.status).toBe("Ready for Accounts");
    expect(state.siteReviewBlockers).toEqual([]);
  });

  it("keeps a submission current when only accounting coding changed its full hash", async () => {
    const state = await getSupplierInvoiceWorkflowState({
      supabase: client(
        fixture({
          submission: {
            id: "submission-1",
            organization_id: "org-1",
            supplier_invoice_id: "invoice-1",
            finance_hash: "old-finance-hash",
            operational_hash: "operational-hash",
            status: "approved",
          },
          decisions: [{ id: "decision-1", organization_id: "org-1", submission_id: "submission-1", decision: "approved" }],
        }),
        { finance: "new-finance-hash", operational: "operational-hash" },
      ),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
    });

    expect(state.operationalHash).toBe("operational-hash");
    expect(state.financeHash).toBe("new-finance-hash");
    expect(state.activeSubmissionId).toBe("submission-1");
    expect(state.status).toBe("Ready for Accounts");
  });
});
