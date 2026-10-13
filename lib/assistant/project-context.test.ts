import { describe, expect, it } from "vitest";
import { buildProjectAIContext } from "./project-context";
import type { AssistantContext, AssistantToolResult } from "./types";

const context: AssistantContext = {
  organizationId: "org-1", projectId: "project-1", projectSlug: "job-1", projectName: "Job 1",
  route: "/app/projects/job-1/preconstruction/variations/v-1", module: "variations", recordId: "v-1",
};

function result(toolName: string, value: unknown): AssistantToolResult {
  return {
    toolName, sourceService: "fixture", status: "ok", data: value, returnedRows: 1, totalRows: 1, truncated: false,
    asOf: "2026-10-06T00:00:00.000Z", citations: [{ entityType: "variation", entityId: "v-1", label: "VO-1", href: "/app/projects/job-1/preconstruction/variations/v-1", projectId: "project-1" }],
  };
}

describe("project AI context", () => {
  it("normalizes authorized reader output without question routing", async () => {
    const built = await buildProjectAIContext(context, ["variations", "purchase_orders"], async (tool) => result(tool, {
      records: [{ id: "v-1", title: "Door change", total: 1250, purchaseOrderId: "po-1", lines: [{ id: "line-1", description: "Door", total: 1250 }] }],
    }));

    expect(built.context.schemaVersion).toBe("project-ai-context.v1");
    expect(built.context.currentContext.currentEntityId).toBe("v-1");
    expect(built.context.entities.some((entity) => entity.id === "line-1")).toBe(true);
    expect(built.context.entities.find((entity) => entity.id === "v-1")?.relationships).toEqual(expect.arrayContaining([{ relationshipType: "purchaseOrder", targetEntityType: "purchaseOrder", targetId: "po-1" }]));
    expect(built.context.authoritativeValues.some((value) => value.name.includes("total"))).toBe(true);
  });

  it("preserves non-success source states instead of turning them into empty data", async () => {
    const built = await buildProjectAIContext(context, ["qa"], async () => ({ toolName: "qa", sourceService: "fixture", status: "denied", reasonCode: "NO_PERMISSION", safeMessage: "Not allowed" }));
    expect(built.context.entities).toHaveLength(0);
    expect(built.context.availability).toEqual([{ source: "qa", status: "denied", message: "Not allowed" }]);
  });
});
