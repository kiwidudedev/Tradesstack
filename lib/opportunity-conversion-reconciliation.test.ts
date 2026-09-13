import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_CONVERSION_RECONCILIATION_WARNING,
  hasUnclassifiedDeliveryProjectCandidates,
  isOpportunityConversionReconciliationWarning,
  selectCanonicalOpportunityQuote,
  shouldRetryAcceptedOpportunityConversion,
} from "./opportunity-conversion-reconciliation";

describe("opportunity conversion reconciliation warning", () => {
  it("remains required while an unclassified delivery candidate exists", () => {
    expect(hasUnclassifiedDeliveryProjectCandidates({
      convertedProjectId: null,
      workspaceProjectId: "workspace",
      sourceProjectIds: ["workspace", "candidate"],
    })).toBe(true);
  });

  it("does not treat the tender workspace itself as a delivery candidate", () => {
    expect(hasUnclassifiedDeliveryProjectCandidates({
      convertedProjectId: null,
      workspaceProjectId: "workspace",
      sourceProjectIds: ["workspace"],
    })).toBe(false);
  });

  it("clears after a canonical conversion is recorded", () => {
    expect(hasUnclassifiedDeliveryProjectCandidates({
      convertedProjectId: "candidate",
      workspaceProjectId: "workspace",
      sourceProjectIds: ["workspace", "candidate"],
    })).toBe(false);
  });

  it("recognizes only the server reconciliation warning", () => {
    expect(isOpportunityConversionReconciliationWarning(
      OPPORTUNITY_CONVERSION_RECONCILIATION_WARNING,
    )).toBe(true);
    expect(isOpportunityConversionReconciliationWarning("Unable to save quote.")).toBe(false);
  });

  it("retries conversion without rewriting an already persisted Accepted quote", () => {
    expect(shouldRetryAcceptedOpportunityConversion({
      quoteId: "quote-1",
      selectedStatus: "Accepted",
      persistedStatus: "Accepted",
    })).toBe(true);
    expect(shouldRetryAcceptedOpportunityConversion({
      quoteId: "quote-1",
      selectedStatus: "Accepted",
      persistedStatus: "Draft",
    })).toBe(false);
  });

  it("keeps the mapped accepted quote authoritative over later quote revisions", () => {
    const mapped = { id: "accepted-quote", status: "Accepted", number: "Q-4" };
    const later = { id: "later-quote", status: "Sent", number: "Q-6" };

    expect(selectCanonicalOpportunityQuote({
      quotes: [later, mapped],
      mappedAcceptedQuoteId: mapped.id,
    })).toBe(mapped);
  });

  it("prefers a sent quote before conversion and otherwise uses the latest row", () => {
    const latest = { id: "latest", status: "Draft" };
    const sent = { id: "sent", status: "Sent" };

    expect(selectCanonicalOpportunityQuote({
      quotes: [latest, sent],
      mappedAcceptedQuoteId: null,
    })).toBe(sent);
    expect(selectCanonicalOpportunityQuote({
      quotes: [latest],
      mappedAcceptedQuoteId: null,
    })).toBe(latest);
  });
});
