import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfiguredStorageProviderKind } from "@/lib/storage/provider";

describe("R2 document storage feature flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps Supabase as the default", () => {
    vi.stubEnv("TRADESSTACK_STORAGE_PROVIDER", "r2");
    vi.stubEnv("TRADESSTACK_R2_DOCUMENTS_ENABLED", "0");
    expect(getConfiguredStorageProviderKind()).toBe("supabase");
  });

  it("requires both the provider selection and explicit Alpha opt-in", () => {
    vi.stubEnv("TRADESSTACK_STORAGE_PROVIDER", "r2");
    vi.stubEnv("TRADESSTACK_R2_DOCUMENTS_ENABLED", "1");
    expect(getConfiguredStorageProviderKind()).toBe("r2");
  });
});
