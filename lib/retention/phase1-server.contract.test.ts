import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/retention/phase1-server.ts", "utf8");

describe("Retention Management Phase 1 server boundary", () => {
  it("uses only the tenant-resolving Phase 1 RPCs", () => {
    for (const rpcName of [
      "get_organization_retention_capability",
      "set_organization_retention_capability",
      "get_project_retention_workflow_state",
      "transition_project_retention_workflow_mode",
      "get_retention_capability_events",
    ]) {
      expect(source).toContain(`rpc("${rpcName}"`);
    }
    expect(source).not.toContain('.from("organization_capabilities")');
    expect(source).not.toContain('.from("project_retention_workflow_states")');
    expect(source).not.toContain('.from("retention_capability_events")');
  });

  it("contains identity and state types but no Retention Claim financial behavior", () => {
    expect(source).toContain('RETENTION_CAPABILITY_KEY = "retention_management"');
    expect(source).toContain('"legacy"');
    expect(source).toContain('"observe"');
    expect(source).toContain('"ready"');
    expect(source).toContain('"cutover"');
    expect(source).toContain('"blocked"');
    expect(source).not.toContain("retention_claims");
    expect(source).not.toContain("retention_claim_allocations");
    expect(source).not.toContain("project_claims");
    expect(source).not.toMatch(/\b(amount|balance|gst|tax|invoice|payment)\b/i);
  });
});
