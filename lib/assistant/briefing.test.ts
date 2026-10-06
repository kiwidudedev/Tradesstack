import { describe, expect, it } from "vitest";
import { buildProjectBriefing } from "./briefing";
import type { AssistantContext, AssistantToolResult } from "./types";

const context: AssistantContext = {
  organizationId: "org-1",
  projectId: "project-26028",
  projectSlug: "air-nz-fitout",
  projectName: "Air NZ Fitout",
  route: null,
  module: "project",
  recordId: null,
};

function ok(toolName: string, data: unknown): AssistantToolResult {
  return { toolName, sourceService: "fixture", status: "ok", data, citations: [], returnedRows: Array.isArray((data as { records?: unknown[] })?.records) ? ((data as { records: unknown[] }).records.length) : 1, totalRows: null, truncated: false, asOf: "2026-10-06T00:00:00.000Z" };
}

describe("project briefing", () => {
  it("combines commercial, procurement, variations, claims and QA into deterministic priorities", async () => {
    const results: Record<string, AssistantToolResult> = {
      project_overview: ok("project_overview", { financial: { approvedVariations: 25000, committed: 0, revenue: 29000, profitability: { status: "unsupported" } } }),
      variations: ok("variations", { records: [{ id: "v1", number: "VAR-02", approvalState: "pending", value: 10000 }] }),
      purchase_orders: ok("purchase_orders", { records: [{ id: "po1", number: "PO-1", status: "Draft", total: 5000 }], registerTotal: 5000 }),
      payment_claims: ok("payment_claims", { records: [{ id: "c1", status: "Submitted", amount: 29000 }] }),
      qa: ok("qa", { records: [{ id: "qa1", status: "Open" }] }),
      project_activity: { toolName: "project_activity", sourceService: "fixture", status: "empty", data: [], citations: [], truncated: false, returnedRows: 0, totalRows: 0, asOf: "2026-10-06T00:00:00.000Z" },
    };
    const briefing = await buildProjectBriefing(context, async (tool) => results[tool]);
    expect(briefing.variations.pendingCount).toBe(1);
    expect(briefing.procurement.draftCount).toBe(1);
    expect(briefing.risks.map((risk) => risk.code)).toEqual(expect.arrayContaining(["UNAPPROVED_VARIATIONS", "DRAFT_PURCHASE_ORDERS", "OPEN_QA"]));
    expect(briefing.priorities[0].title).toContain("variation");
  });

  it("preserves unavailable modules instead of treating them as empty", async () => {
    const unavailable: AssistantToolResult = { toolName: "qa", sourceService: "fixture", status: "failed", errorCode: "READ_SERVICE_ERROR", safeMessage: "QA unavailable", diagnosticId: "ast_test" };
    const empty: AssistantToolResult = { toolName: "project_activity", sourceService: "fixture", status: "empty", data: [], citations: [], truncated: false, returnedRows: 0, totalRows: 0, asOf: "2026-10-06T00:00:00.000Z" };
    const base = (tool: string): AssistantToolResult => tool === "qa" ? unavailable : tool === "project_activity" ? empty : ok(tool, { records: [] });
    const briefing = await buildProjectBriefing(context, async (tool) => base(tool));
    expect(briefing.unavailableModules).toEqual([{ tool: "qa", status: "failed", message: "QA unavailable" }]);
  });
});
