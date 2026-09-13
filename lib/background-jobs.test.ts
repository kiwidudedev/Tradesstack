import { afterEach, describe, expect, it, vi } from "vitest";
import { isBackgroundJobEnabled } from "./background-jobs";
afterEach(() => vi.unstubAllEnvs());
describe("background activation", () => {
  it.each([undefined, "", " ", "*", "true", "document-storage-cleanup-extra"])("does not infer activation from %s", (value) => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", value);
    expect(isBackgroundJobEnabled("document-storage-cleanup")).toBe(false);
  });
  it("enables only explicit names and keeps retention separate from interpretation", () => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", " material-supplier-pricing, xero-sync ");
    expect(isBackgroundJobEnabled("material-supplier-pricing")).toBe(true);
    expect(isBackgroundJobEnabled("xero-sync")).toBe(true);
    expect(isBackgroundJobEnabled("material-source-retention")).toBe(false);
  });
});
