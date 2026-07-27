import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { buildScopePrompt } from "./route";

describe("scope builder prompt", () => {
  it("includes the organization construction context when provided", () => {
    const prompt = buildScopePrompt(
      "Wall Linings",
      "Company Construction Context:\n\nWe mostly work on office fitouts and suspended ceilings."
    );

    expect(prompt).toContain("Company Construction Context:");
    expect(prompt).toContain("We mostly work on office fitouts and suspended ceilings.");
    expect(prompt).toContain("Trade: Wall Linings");
  });

  it("omits the construction context block when no profile exists", () => {
    const prompt = buildScopePrompt("Wall Linings");

    expect(prompt).not.toContain("Company Construction Context:");
    expect(prompt).toContain("Trade: Wall Linings");
  });
});
