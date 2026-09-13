import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts", import.meta.url),
  "utf8",
);
const conversion = readFileSync(new URL("./leads-clients-server.ts", import.meta.url), "utf8");
const shadow = readFileSync(new URL("./opportunity-promotion-shadow-server.ts", import.meta.url), "utf8");

describe("Stage 4 shadow boundary under Stage 5 orchestration", () => {
  it("keeps lifecycle branching behind one authoritative server RPC", () => {
    expect(conversion).toContain('"award_opportunity_by_lifecycle_v1"');
    expect(route).toContain("fileMigrationStatus: result.legacyTenderDataMigrationStatus");
    expect(route).not.toContain("promote_opportunity_workspace_v1");
    expect(conversion).not.toContain("promote_opportunity_workspace_v1");
    expect(shadow).not.toContain("promote_opportunity_workspace_v1");
  });

  it("isolates both telemetry phases from conversion failures", () => {
    expect(shadow).toContain("capturePromotionShadowBestEffort");
    expect(shadow).toContain("finalizePromotionShadowBestEffort");
    expect(shadow.match(/catch \(error\)/g)).toHaveLength(2);
    expect(shadow).toContain("return null");
  });

  it("uses server-only service credentials and deterministic correlation IDs", () => {
    expect(shadow).toContain('import "server-only"');
    expect(shadow).toContain("createAdminSupabaseClient");
    expect(shadow).toContain("deterministicUuid");
    expect(shadow).toContain('"capture_opportunity_promotion_shadow_v2"');
    expect(shadow).toContain('"finalize_opportunity_promotion_shadow_v2"');
  });
});
