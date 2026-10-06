import { describe, expect, it } from "vitest";
import { proposeAssistantAction } from "./actions";

const context = { organizationId: "org-1", projectId: "project-1", projectSlug: "air-nz-fitout", projectName: "Air NZ Fitout", route: null, module: "project", recordId: null };

describe("assistant action proposals", () => {
  it("creates a confirmation-required draft task proposal without mutating data", () => {
    const proposal = proposeAssistantAction("Create a task to chase the supplier Friday", context);
    expect(proposal).toMatchObject({ kind: "create_draft_task", status: "confirmation_required", requiresConfirmation: true, projectId: "project-1", permission: "project_todos.write" });
    expect(proposal?.idempotencyKey).toContain("project-1");
  });

  it("does not treat an approval request as an executable action", () => {
    expect(proposeAssistantAction("Approve this PO", context)).toBeNull();
  });
});
