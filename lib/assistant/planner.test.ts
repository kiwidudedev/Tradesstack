import { describe, expect, it } from "vitest";
import { planAssistantQuestion } from "./planner";

describe("assistant question planner", () => {
  it("requires variation line evidence for component aggregation", () => {
    expect(planAssistantQuestion("What is the total material value in the variations?", ["project_overview", "variations", "variation_details"]).requiredFacts).toContain("structured commercial line items");
    expect(planAssistantQuestion("What is the total material value in the variations?", []).depth).toBe("detail");
  });

  it("classifies procurement aggregation separately from actions", () => {
    expect(planAssistantQuestion("How much material have we ordered?", ["purchase_orders", "purchase_order_details"]).answerType).toBe("aggregation");
    expect(planAssistantQuestion("Create a follow-up for the supplier", ["purchase_orders"]).answerType).toBe("action");
  });
});
