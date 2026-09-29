import { defineTradesStackClientConfig, type ClientConfig } from "@tradesstack/client-config";

export const CLIENT_ALPHA_CONFIG = defineTradesStackClientConfig({
  schemaVersion: 1,
  identity: { clientKey: "client-alpha", displayName: "Client Alpha" },
  theme: { platformColor: "#123456", actionColor: "#D9480F" },
  defaults: { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland" },
});

export const CLIENT_BETA_CONFIG = defineTradesStackClientConfig({
  schemaVersion: 1,
  identity: { clientKey: "client-beta", displayName: "Client Beta" },
  theme: { platformColor: "#203040", actionColor: "#2F80ED" },
  defaults: { locale: "en-AU", currency: "AUD", timezone: "Australia/Sydney" },
});

export function resolveProofShell(config: ClientConfig) {
  return {
    appName: config.identity.displayName,
    platformColor: config.theme.platformColor,
    actionColor: config.theme.actionColor,
    defaults: { ...config.defaults },
  };
}
