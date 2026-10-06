import { describe, expect, it } from "vitest";
import { ASSISTANT_READ_REGISTRY, selectAssistantTools } from "./tools";

describe("assistant tool selection", () => {
  const all = ["project_overview", "project_activity", "quotes", "purchase_orders", "variations", "payment_claims", "retentions", "contacts", "qa", "documents"];

  it("always includes bounded project context", () => {
    expect(selectAssistantTools("hello", all)).toEqual(["project_overview"]);
  });

  it("selects only explicit read modules and caps tool count", () => {
    const selected = selectAssistantTools("Show recent activity, quotes, purchase orders, variations, claims and QA", all);
    expect(selected[0]).toBe("project_overview");
    expect(selected.length).toBeLessThanOrEqual(4);
    expect(selected).not.toContain("write");
  });

  it("honours customer module configuration", () => {
    expect(selectAssistantTools("Show quotes and purchase orders", ["project_overview", "quotes"])).toEqual(["project_overview", "quotes"]);
  });

  it("selects bounded document metadata access without creating a mutation capability", () => {
    expect(selectAssistantTools("Which drawings and files are in this project?", all)).toEqual(["project_overview", "documents"]);
  });

  it("understands construction shorthand for variation and procurement reads", () => {
    expect(selectAssistantTools("Which VOs and POs are still pending?", all)).toEqual(["project_overview", "purchase_orders", "variations"]);
  });

  it("exposes a read-only registry with explicit source and scope metadata", () => {
    expect(ASSISTANT_READ_REGISTRY.purchase_orders).toMatchObject({
      sourceService: "listPurchaseOrders",
      projectScoped: true,
      organizationScoped: true,
      readOnly: true,
    });
    expect(Object.values(ASSISTANT_READ_REGISTRY).every((tool) => tool.readOnly)).toBe(true);
  });
});
