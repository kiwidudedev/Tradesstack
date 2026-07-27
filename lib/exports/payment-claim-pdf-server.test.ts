import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createAdminSupabaseClient }));

import {
  buildPaymentClaimPdfExportModelServer,
  generatePaymentClaimPdfBundleServer,
} from "./payment-claim-pdf-server";

type Row = Record<string, unknown>;

function admin(country = "New Zealand") {
  const tables: Record<string, Row[]> = {
    organizations: [{
      id: "org-1", name: "TradesStack", country, logo_path: null, brand_primary_color: "#0B2739",
      business_number: "9429000000000", bank_account_details: "12-1234-1234567-00",
      gst_number: "123-456-789", contact_name: "Accounts", contact_email: "accounts@example.com", contact_phone: "0210000000",
    }],
    project_claims: [{
      id: "claim-1", organization_id: "org-1", project_id: "project-1", claim_number: "PC:0042",
      claim_date: "2026-07-21", due_date: "2026-07-28", period_start: "2026-07-01", period_end: "2026-07-31",
      notes: "Current approved claim", linked_quote_value: 1000, linked_approved_variations: 100,
      revised_contract_value: 1100, previous_claims_total: 200, claim_amount: 700,
      retention_withheld_amount: 25, retention_held_to_date: 40, net_claim_excl_gst: 675,
      gst_amount: 101.25, total_payable: 776.25,
    }],
    organization_projects: [{ id: "project-1", organization_id: "org-1", name: "House", location: "Auckland", client_id: "client-1" }],
    organization_clients: [{ id: "client-1", organization_id: "org-1", name: "Casey", company_name: "Client Ltd" }],
    project_claim_line_items: [{
      id: "line-1", organization_id: "org-1", claim_id: "claim-1", source_kind: "Quote",
      source_number: "Q-1", source_title: "", description: "Framing", source_total: 1000,
      previously_claimed_amount: 200, claim_percent: 87.5, sort_order: 1,
    }],
  };
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select() { return builder; },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
        order() { return builder; },
        maybeSingle: async () => ({ data: rows.find((row) => filters.every((filter) => filter(row))) ?? null, error: null }),
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve);
        },
      };
      return builder;
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
}

describe("server Payment Claim PDF bundle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the normal authoritative PDF model with persisted revenue, retention, GST and total", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(admin());
    const result = await buildPaymentClaimPdfExportModelServer({ organizationId: "org-1", claimId: "claim-1" });
    expect(result.model).toMatchObject({
      claimNumber: "PC:0042",
      grossCurrentClaimLabel: "$700.00",
      retentionWithheldLabel: "$25.00",
      netCurrentClaimLabel: "$675.00",
      gstAmountLabel: "$101.25",
      totalPayableLabel: "$776.25",
    });
    expect(result.model.lineItems[0]).toMatchObject({
      description: "Framing", sourceLabel: "Quote Q-1", progressLabel: "90.00%", totalLabel: "$900.00",
    });
  });

  it("reuses the normal composer and appends the existing NZ Form 1 bundle", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(admin("New Zealand"));
    const result = await generatePaymentClaimPdfBundleServer({ organizationId: "org-1", claimId: "claim-1" });
    expect(result.fileName).toBe("Payment-Claim-PC 0042.pdf");
    expect(result.statutoryDocumentsIncluded.map((entry) => entry.id)).toEqual(["nz-payment-claim-form-1"]);
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("preserves the existing non-NZ PDF behavior without statutory documents", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(admin("Australia"));
    const result = await generatePaymentClaimPdfBundleServer({ organizationId: "org-1", claimId: "claim-1" });
    expect(result.statutoryDocumentsIncluded).toEqual([]);
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
  });
});
