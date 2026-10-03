import { describe, expect, it } from "vitest";
import {
  CLIENT_SCHEDULER_DISPATCH_PATH,
  ClientConfigValidationError,
  defineTradesStackClientConfig,
  MASTER_CLIENT_CONFIG,
  resolveTradesStackClientConfig,
} from "@tradesstack/client-config";

const alpha = {
  schemaVersion: 1,
  identity: { clientKey: "client-alpha", displayName: "Client Alpha" },
  theme: { platformColor: "#123456", actionColor: "#D9480F" },
  defaults: { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland" },
};

const beta = {
  schemaVersion: 1,
  identity: { clientKey: "client-beta", displayName: "Client Beta" },
  theme: { platformColor: "#203040", actionColor: "#2F80ED" },
  defaults: { locale: "en-AU", currency: "AUD", timezone: "Australia/Sydney" },
};

describe("@tradesstack/client-config", () => {
  it("resolves two client deployments through the same implementation", () => {
    const resolvedAlpha = resolveTradesStackClientConfig(alpha);
    const resolvedBeta = resolveTradesStackClientConfig(beta);

    expect(resolvedAlpha.identity.displayName).toBe("Client Alpha");
    expect(resolvedBeta.identity.displayName).toBe("Client Beta");
    expect(resolvedAlpha.theme.actionColor).not.toBe(resolvedBeta.theme.actionColor);
    expect(resolvedAlpha.defaults.currency).toBe("NZD");
    expect(resolvedBeta.defaults.currency).toBe("AUD");
    expect(Object.keys(resolvedAlpha)).toEqual(Object.keys(resolvedBeta));
  });

  it("preserves the explicit Master defaults", () => {
    expect(defineTradesStackClientConfig(MASTER_CLIENT_CONFIG)).toEqual(MASTER_CLIENT_CONFIG);
  });

  it("fails closed for missing required fields, invalid values, and unknown fields", () => {
    expect(() => defineTradesStackClientConfig({})).toThrow(ClientConfigValidationError);
    expect(() => defineTradesStackClientConfig({
      ...alpha,
      defaults: { ...alpha.defaults, timezone: "Mars/TradesStack" },
    })).toThrow("defaults.timezone");
    expect(() => defineTradesStackClientConfig({
      ...alpha,
      apiKey: "must-not-be-config",
    })).toThrow("unknown fields are not allowed");
  });

  it("validates provider-independent scheduler configuration without accepting secrets", () => {
    const resolved = defineTradesStackClientConfig({
      ...alpha,
      scheduler: {
        adapter: "vercel-cron",
        dispatcherPath: CLIENT_SCHEDULER_DISPATCH_PATH,
        enabledJobs: ["retention-rolling-drafts", "document-storage-cleanup"],
      },
    });
    expect(resolved.scheduler).toEqual({
      adapter: "vercel-cron",
      dispatcherPath: "/api/cron/dispatch",
      enabledJobs: ["retention-rolling-drafts", "document-storage-cleanup"],
    });
    expect(() => defineTradesStackClientConfig({
      ...alpha,
      scheduler: {
        adapter: "vercel-cron",
        dispatcherPath: "/api/cron/dispatch",
        enabledJobs: ["retention-rolling-drafts", "retention-rolling-drafts"],
      },
    })).toThrow("must not contain duplicates");
    expect(() => defineTradesStackClientConfig({
      ...alpha,
      scheduler: {
        adapter: "vercel-cron",
        dispatcherPath: "/api/cron/dispatch",
        enabledJobs: ["not-a-client-job"],
      },
    })).toThrow("not an allowlisted scheduler job");
    expect(() => defineTradesStackClientConfig({
      ...alpha,
      scheduler: {
        adapter: "vercel-cron",
        dispatcherPath: "/api/cron/dispatch",
        enabledJobs: [],
        cronSecret: "must-not-be-config",
      },
    })).toThrow("unknown fields are not allowed");
  });
});
