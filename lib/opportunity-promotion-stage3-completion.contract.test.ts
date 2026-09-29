import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Stage 3 completion contracts", () => {
  it("blocks ordinary lifecycle deletion without weakening lifecycle immutability", () => {
    const server = read("lib/leads-clients-server.ts");
    const route = read("app/api/leads-clients/opportunities/[opportunitySlug]/delete/route.ts");
    expect(server).toContain('.from("opportunity_lifecycles")');
    expect(server).toContain("Lifecycle-managed opportunities cannot be deleted");
    expect(route).toContain("status: 409");
  });

  it("does not clear award identity from the active board", () => {
    const board = read("app/app/(workspace)/leads-clients/opportunities/OpportunitiesBoard.tsx");
    expect(board).toContain("Awarded opportunities cannot be moved out of Won");
    expect(board).not.toContain("payload.converted_project_id = null");
    expect(board).not.toContain("payload.converted_at = null");
  });

  it("uses the authoritative baseline in both previously inconsistent readers", () => {
    for (const path of [
      "components/app/ProjectDashboardBoard.tsx",
      "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/PaymentClaimDetailClient.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain(
        path.includes("ProjectDashboardBoard")
          ? "get_project_dashboard_aggregate"
          : "resolveAuthoritativeContractualBaseline",
      );
      expect(source).not.toContain('left.status === "Accepted"');
      expect(source).not.toContain('right.status === "Accepted"');
    }
  });
});
