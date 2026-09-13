import { describe, expect, it } from "vitest";
import { resolveOpportunityTenderClients } from "./opportunity-lead-details";

describe("Opportunity Lead Details Tender Clients", () => {
  it("shows every active Tender Client once with Primary first", () => {
    expect(resolveOpportunityTenderClients([
      { client_id: "harbour", client_name: "Harbour Side Builders", is_tender_client: true },
      { client_id: "fletcher", client_name: "Fletcher duplicate", is_tender_client: true },
      { client_id: "dynamic", client_name: "Dynamic Tool & Die", is_tender_client: true },
      { client_id: "fletcher", client_name: "Fletcher Construction", is_tender_client: true },
    ], { id: "fletcher", name: "Fletcher Construction" })).toEqual([
      { id: "fletcher", name: "Fletcher Construction" },
      { id: "harbour", name: "Harbour Side Builders" },
      { id: "dynamic", name: "Dynamic Tool & Die" },
    ]);
  });

  it("excludes archived relationships and unresolved historical recipients", () => {
    expect(resolveOpportunityTenderClients([
      { client_id: "active", client_name: "Active Client", is_tender_client: true },
      { client_id: "archived", client_name: "Archived Client", is_tender_client: true, archived_at: "2026-08-22" },
      { client_id: "orphan", client_name: "Historical Recipient", is_tender_client: false },
    ], null)).toEqual([{ id: "active", name: "Active Client" }]);
  });

  it("falls back to the Primary Client for legacy data without relationships", () => {
    expect(resolveOpportunityTenderClients([], {
      id: "fletcher",
      name: "Fletcher Construction",
    })).toEqual([{ id: "fletcher", name: "Fletcher Construction" }]);
  });
});
