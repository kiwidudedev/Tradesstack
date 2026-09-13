import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const register = readFileSync(new URL("../components/app/OpportunityQuoteRegister.tsx", import.meta.url), "utf8");
const registerStatus = readFileSync(new URL("../components/app/OpportunityQuoteRegisterStatus.tsx", import.meta.url), "utf8");
const revision = readFileSync(new URL("../components/app/OpportunityQuoteRevisionEditor.tsx", import.meta.url), "utf8");
const sharedEditor = readFileSync(new URL("../components/app/QuoteEditorShared.tsx", import.meta.url), "utf8");

describe("Opportunity quotation routes", () => {
  it("loads Primary and Tender Client readiness in one register query", () => {
    expect(register).toContain("get_opportunity_quotation_workspace_v1");
    expect(register).toContain("primary_quote");
    expect(register).not.toContain("Create Missing Quotes");
    expect(register).toContain("row.current_revision_id");
    expect(register).toContain("Not created");
    expect(register).not.toContain("Each quotation is a snapshot and can be revised independently after creation.");
    expect(register).not.toContain("Manage quotations and revisions for each Tender Client.");
    expect(register).toContain('title="Quotations"');
    expect(register).not.toContain("Primary Client</div>");
    expect(register).not.toContain("Manage Tender Clients</Link>");
    expect(register.indexOf("<OperationalTableHead>Updated</OperationalTableHead>"))
      .toBeLessThan(register.indexOf("Quoted Amount</OperationalTableHead>"));
    expect(register).toContain("actions={(");
    expect(register).not.toContain("toolbar={(");
  });

  it("keeps the source-change condition while presenting the pricing warning inline", () => {
    expect(register).toContain("sourceChanged={row.source_changed_since_distribution}");
    expect(registerStatus).toContain("Pricing has changed");
    expect(registerStatus).not.toContain("Source changed since creation");
    expect(register).toContain("<OperationalTableHead>Status</OperationalTableHead>");
    expect(register).not.toContain('<OperationalTableHead className="text-center">Status</OperationalTableHead>');
    expect(registerStatus).toContain("grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 whitespace-nowrap");
    expect(registerStatus).toContain('data-testid="quote-register-status-badge"');
    expect(registerStatus).toContain('data-testid="quote-register-pricing-warning"');
    expect(registerStatus).toContain("justify-self-center text-xs text-amber-700");
    expect(registerStatus).not.toContain("absolute");
    expect(registerStatus).not.toContain("justify-center");
  });

  it("creates a client-selected series and routes to the exact revision", () => {
    expect(register).toContain("create_opportunity_quote_series_v1");
    expect(register).toContain("p_recipient_client_id: clientId");
    expect(register).toContain("result.data?.[0]?.revision_id");
  });

  it("keeps historical URLs exact and read-only", () => {
    expect(revision).toContain(".eq(\"id\", resolvedRevisionId)");
    expect(revision).toContain("currentRevisionId === quoteId");
    expect(revision).toContain("persistedQuoteStatus === \"Draft\"");
    expect(revision).toContain("Open Current Revision");
    expect(revision).toContain("currentRevisionId}");
  });

  it("reuses the series history RPC for a newest-first Previous Revisions table", () => {
    const history = readFileSync(new URL("../components/app/OpportunityQuoteRevisionHistory.tsx", import.meta.url), "utf8");
    expect(revision).toContain("get_opportunity_quote_revision_history_v1");
    expect(revision).toContain("setRevisionHistory(historyRows)");
    expect(revision).toContain("selectPreviousOpportunityQuoteRevisions");
    expect(revision).toContain("<OpportunityQuoteRevisionHistory");
    expect(history).toContain('title="Previous Revisions"');
    expect(history).toContain("Quoted Amount");
    expect(history).toContain("row.total_quote_price");
    expect(history).toContain("row.updated_at");
    expect(history).toContain("row.revision_id");
  });

  it("allows only the current immutable leaf to create a revision", () => {
    expect(revision).toContain("isCurrentRevision && persistedQuoteStatus");
    expect(revision).toContain("create_opportunity_quote_revision_v1");
    expect(revision).toContain("p_predecessor_quote_id: quoteId");
    expect(revision).toContain("!isCurrentRevision && currentRevisionId");
  });

  it("preserves the established quote editor for every client revision", () => {
    expect(revision).toContain('heroTitle="Quote"');
    expect(revision).toContain("QuoteEditorLayout");
    expect(revision).not.toContain("← Back to Quotations");
    expect(revision).not.toContain("masterMode");
    expect(revision).not.toContain("Master Quote");
    for (const label of [
      "Quote Details", "Client", "Quote Date", "Expiry Date", "Site Address",
      "Quote Number", "Status", "Quote Title", "Project Name", "Line Items",
      "Save Quote", "Export PDF",
    ]) {
      expect(sharedEditor).toContain(label);
    }
    expect(sharedEditor).not.toContain("No client linked yet");
    expect(sharedEditor).not.toContain("MASTER-");
  });

  it("does not mark an Opportunity lost when one recipient rejects", () => {
    expect(revision).toContain("The opportunity remains active");
    expect(revision).not.toContain("update({ stage: \"Lost\" })");
  });
});
