import { describe, expect, it } from "vitest";
import { buildPersistedProjectQuotePdfSnapshot } from "@/lib/project-quote-pdf-snapshot";

describe("persisted Project Quote PDF snapshot", () => {
  it("uses stored quote totals and stored line values", () => {
    const result = buildPersistedProjectQuotePdfSnapshot({
      assumptions: "Persisted assumption",
      clarifications: "Persisted clarification",
      client_email: "client@example.com",
      client_name: "Client",
      client_phone: "123",
      company_name: "Company",
      contact_person: "Person",
      contingency_amount: 5,
      discount_amount: 3,
      expiry_date: "2026-09-30",
      gst_amount: 18.3,
      gst_percent: 15,
      margin_amount: 20,
      optional_subtotal: 7,
      project_name: "Project",
      quote_date: "2026-08-19",
      quote_number: "Q-1",
      site_address: "Site",
      subtotal: 100,
      terms_exclusions: "Excluded",
      terms_inclusions: "Included",
      total_quote_price: 140.3,
    }, [{
      id: "line-1",
      section: "Materials",
      description: "Persisted line",
      quantity: 2,
      unit: "ea",
      rate: 50,
      is_optional: false,
    }]);

    expect(result.pricingSummary).toEqual({
      baseSubtotal: 100,
      optionalSubtotal: 7,
      margin: 20,
      contingency: 5,
      discount: 3,
      gst: 18.3,
      grandTotal: 140.3,
    });
    expect(result.lineItems[0]).toMatchObject({ description: "Persisted line", rate: 50 });
  });
});
