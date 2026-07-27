import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("organization construction profile usage boundaries", () => {
  it("is not wired into the forbidden Phase 1 flows", () => {
    const forbiddenFiles = [
      "lib/accounting/organization-cost-code-resolver.ts",
      "lib/project-cost-report.ts",
      "lib/worksheet-event-semantic-classification.ts",
      "lib/worksheet-memory-synthesis.ts",
      "lib/worksheet-pricing-pattern-shadow.ts",
    ];

    for (const relativePath of forbiddenFiles) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).not.toContain("buildOrganizationAiContext");
      expect(source).not.toContain("organizationConstructionContext");
    }
  });
});
