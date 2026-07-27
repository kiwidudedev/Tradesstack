import { afterEach, describe, expect, it, vi } from "vitest";

describe("xero env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects malformed token encryption keys during environment validation", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("XERO_CLIENT_ID", "client");
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    vi.stubEnv("XERO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", "short");

    const { getXeroEnv } = await import("./env");
    expect(() => getXeroEnv()).toThrow(/XERO_TOKEN_ENCRYPTION_KEY/);
  });

  it("requires the default offline_access scope for refresh-token support", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("XERO_CLIENT_ID", "client");
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    vi.stubEnv("XERO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv(
      "XERO_SCOPES",
      "openid profile email accounting.settings accounting.contacts accounting.invoices accounting.attachments",
    );

    const { getXeroEnv } = await import("./env");
    expect(() => getXeroEnv()).toThrow(/offline_access/);
  });

  it("requires accounting.invoices for Draft Xero Bill access", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("XERO_CLIENT_ID", "client");
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    vi.stubEnv("XERO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv(
      "XERO_SCOPES",
      "openid profile email accounting.settings accounting.contacts accounting.attachments offline_access",
    );

    const { getXeroEnv } = await import("./env");
    expect(() => getXeroEnv()).toThrow(/accounting.invoices/);
  });

  it("requires accounting.attachments for Payment Claim PDF upload", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("XERO_CLIENT_ID", "client");
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    vi.stubEnv("XERO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv(
      "XERO_SCOPES",
      "openid profile email accounting.settings accounting.contacts accounting.invoices offline_access",
    );
    const { getXeroEnv } = await import("./env");
    expect(() => getXeroEnv()).toThrow(/accounting.attachments/);
  });

  it.each([
    ["accounting.settings", "openid profile email accounting.contacts accounting.invoices accounting.attachments offline_access"],
    ["accounting.contacts", "openid profile email accounting.settings accounting.invoices accounting.attachments offline_access"],
  ])("continues to require the existing %s scope", async (missingScope, configuredScopes) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("XERO_CLIENT_ID", "client");
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    vi.stubEnv("XERO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("XERO_SCOPES", configuredScopes);

    const { getXeroEnv } = await import("./env");
    expect(() => getXeroEnv()).toThrow(new RegExp(missingScope.replace(".", "\\.")));
  });

  it("requires NEXT_PUBLIC_SITE_URL to share the same origin as the Xero redirect URI", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    vi.stubEnv("XERO_CLIENT_ID", "client");
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    vi.stubEnv("XERO_REDIRECT_URI", "https://wrong.example.com/callback");
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));

    const { getXeroEnv } = await import("./env");
    expect(() => getXeroEnv()).toThrow(/same origin/);
  });

  it("requires a strong CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "too-short");

    const { getCronEnv } = await import("./env");
    expect(() => getCronEnv()).toThrow(/at least 24 characters/);
  });
});
