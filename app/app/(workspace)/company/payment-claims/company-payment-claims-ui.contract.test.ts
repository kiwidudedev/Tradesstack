import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CompanyPaymentClaimsFilters } from "@/lib/payment-claims/company-register-presentation";
import type { CompanyPaymentClaimsRegister } from "./payment-claim-register-types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/company/payment-claims",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/font/local", () => ({
  default: () => ({ className: "test-font", variable: "--test-font" }),
}));

import { CompanyPaymentClaimsWorkspace } from "./CompanyPaymentClaimsWorkspace";

const workspace = readFileSync(
  "app/app/(workspace)/company/payment-claims/CompanyPaymentClaimsWorkspace.tsx",
  "utf8",
);
const server = readFileSync(
  "lib/payment-claims/company-register-server.ts",
  "utf8",
);

const filters: CompanyPaymentClaimsFilters = {
  month: null,
  search: null,
  projectId: null,
  clientId: null,
  claimStatus: null,
  xeroStatus: null,
  externalStatus: null,
  paymentStatus: null,
  outstandingOnly: false,
  overdueOnly: false,
  attentionOnly: false,
  sort: "period",
  direction: "desc",
  page: 1,
};

function registerWith(amountPayable: number, withRows = true): CompanyPaymentClaimsRegister {
  return {
    rows: withRows ? [{
      id: "claim-1",
      claim_number: "26028-PC-04",
      claim_title: "Claim 4",
      claim_status: "Submitted",
      claim_date: "2026-07-26",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      internal_due_date: "2026-08-02",
      effective_due_date: "2026-08-02",
      total_payable: 1,
      gst_amount: 0,
      retention_withheld_amount: 0,
      retention_released_amount: 0,
      project_id: "project-1",
      project_slug: "air-nz-fitout",
      project_code: "26028",
      project_name: "Air NZ Fitout",
      client_id: "client-1",
      client_name: "Air New Zealand",
      accounting_document_id: null,
      xero_invoice_number: null,
      xero_invoice_id: null,
      currency: "NZD",
      invoice_date: null,
      trusted_paid_minor: null,
      trusted_outstanding_minor: null,
      projected_at: null,
      divergent: null,
      xero_status: "not_exported",
      external_status: null,
      payment_status: null,
      xero_attention: false,
    }] : [],
    metrics: {
      amountPayable,
      paid: 0,
      outstanding: 0,
      openClaims: withRows ? 1 : 0,
      xeroAttention: 0,
    },
    pageInfo: {
      page: 1,
      pageSize: 50,
      totalRows: withRows ? 1 : 0,
      totalPages: 1,
    },
    options: { projects: [], clients: [], months: [] },
    context: {
      month: "2026-07",
      timezone: "Pacific/Auckland",
      currency: "NZD",
      localToday: "2026-07-29",
    },
  };
}

describe("company Payment Claims register UI contract", () => {
  it("uses one paginated register RPC and no per-row loaders or Xero calls", () => {
    expect(server).toContain('"get_company_payment_claims_register"');
    expect(server).toContain("COMPANY_PAYMENT_CLAIMS_PAGE_SIZE");
    expect(server).not.toContain("createAdminSupabaseClient");
    expect(server).not.toContain("getPaymentClaimXeroPanelState");
    expect(workspace).not.toContain("fetch(");
    expect(workspace).not.toContain(".from(");
  });

  it("provides exactly the required presentation columns", () => {
    for (const heading of [
      "Job Number",
      "Project",
      "Client",
      "Submitted Date",
      "Due Date",
      "Status",
      "Total Claim",
      "Action",
    ]) {
      expect(workspace).toContain(`>${heading}<`);
    }
    for (const removedHeading of [
      "Payment Claim",
      "Project / Client",
      "Claim Period",
      "Due",
      "Amount Payable",
      "Paid",
      "Outstanding",
      "Claim Status",
      "Xero",
      "Payment",
      "Certified",
    ]) {
      expect(workspace).not.toContain(`>${removedHeading}<`);
    }
  });

  it("keeps state in URL parameters and provides reset and accessible actions", () => {
    expect(workspace).toContain("new URLSearchParams(window.location.search)");
    expect(workspace).toContain("router.replace");
    expect(workspace).toContain("Clear all");
    expect(workspace).toContain("aria-label={`Open Payment Claim");
    expect(workspace).toContain("/preconstruction/claims/${row.id}");
  });

  it("does not render the removed project, Xero, or invoice filter controls", () => {
    expect(workspace).not.toContain('aria-label="Project"');
    expect(workspace).not.toContain(">All projects<");
    expect(workspace).not.toContain('aria-label="Xero lifecycle"');
    expect(workspace).not.toContain(">All Xero states<");
    expect(workspace).not.toContain('aria-label="External invoice status"');
    expect(workspace).not.toContain(">All invoice states<");
    expect(workspace).not.toContain('["attention", "Xero attention"');
  });

  it("does not render the timezone and month header eyebrow", () => {
    expect(workspace).not.toContain("eyebrow={`${register.context.timezone}");
  });

  it("does not render the removed header description", () => {
    expect(workspace).not.toContain(
      "Review claim, Xero invoice, and payment positions across all company projects.",
    );
  });

  it("does not render the removed search or claim-status controls", () => {
    expect(workspace).not.toContain('aria-label="Search Payment Claims"');
    expect(workspace).not.toContain("Search claims, projects, clients, Xero...");
    expect(workspace).not.toContain('aria-label="Claim status"');
    expect(workspace).not.toContain(">All claim statuses<");
  });

  it("does not render the removed Open Claims or Xero Attention summary cards", () => {
    expect(workspace).not.toContain('label="Open Claims"');
    expect(workspace).not.toContain('helper="Not fully paid"');
    expect(workspace).not.toContain('label="Xero Attention"');
    expect(workspace).not.toContain('helper="Failed, missing, or divergent"');
  });

  it("uses the existing row fields and formatters for the simplified presentation", () => {
    expect(workspace).toContain("{row.project_name}");
    expect(workspace).toContain("{row.project_code}");
    expect(workspace).toContain('{row.client_name ?? "—"}');
    expect(workspace).toContain("formatRegisterDate(row.claim_date)");
    expect(workspace).toContain("formatRegisterDate(row.effective_due_date)");
    expect(workspace).toContain("claimStatusTone(row.claim_status)");
    expect(workspace).toContain("formatRegisterMoney(Number(row.total_payable), row.currency)");
  });

  it("renders a full-filtered totals footer aligned with Total Claim", () => {
    expect(workspace).toContain("<tfoot>");
    expect(workspace).toContain("border-t-2 border-[var(--border)] bg-[var(--surface-muted)]");
    expect(workspace).toContain("colSpan={6}");
    expect(workspace).toMatch(/>\s*Totals\s*<\/td>/);
    expect(workspace).toContain(
      "formatRegisterMoney(metrics.amountPayable, register.context.currency)",
    );
    expect(workspace).not.toContain("register.rows.reduce");
    expect(workspace).toMatch(
      /formatRegisterMoney\(metrics\.amountPayable, register\.context\.currency\)[\s\S]*?<td className="px-4 py-3 align-middle" \/>/,
    );
  });

  it("renders the latest server total and hides the footer for empty results", () => {
    const firstResult = renderToStaticMarkup(createElement(
      CompanyPaymentClaimsWorkspace,
      { register: registerWith(1234.56), filters },
    ));
    const filteredResult = renderToStaticMarkup(createElement(
      CompanyPaymentClaimsWorkspace,
      { register: registerWith(9876.54), filters },
    ));
    const emptyResult = renderToStaticMarkup(createElement(
      CompanyPaymentClaimsWorkspace,
      { register: registerWith(0, false), filters },
    ));

    expect(firstResult).toContain("Totals");
    expect(firstResult).toContain("$1,234.56");
    expect(filteredResult).toContain("$9,876.54");
    expect(filteredResult).not.toContain("$1,234.56");
    expect(emptyResult).not.toContain("<tfoot");
    expect(emptyResult).not.toContain("Totals");
  });
});
