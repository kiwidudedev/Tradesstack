import {
  defineTradesStackClientConfig,
  MASTER_CLIENT_CONFIG,
  type ClientConfig,
} from "@tradesstack/client-config";

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

/**
 * Master/reference-app adapter. Environment access stays at the application
 * boundary; the portable client-config package remains dependency-free and
 * secret-free.
 */
export function getMasterClientConfig(): ClientConfig {
  return defineTradesStackClientConfig({
    schemaVersion: 1,
    identity: {
      clientKey: envOrDefault("TRADESSTACK_CLIENT_KEY", MASTER_CLIENT_CONFIG.identity.clientKey),
      displayName: envOrDefault("TRADESSTACK_APP_NAME", MASTER_CLIENT_CONFIG.identity.displayName),
      description: envOrDefault(
        "TRADESSTACK_APP_DESCRIPTION",
        MASTER_CLIENT_CONFIG.identity.description,
      ),
    },
    theme: {
      platformColor: envOrDefault(
        "TRADESSTACK_PLATFORM_COLOR",
        MASTER_CLIENT_CONFIG.theme.platformColor,
      ),
      actionColor: envOrDefault(
        "TRADESSTACK_ACTION_COLOR",
        MASTER_CLIENT_CONFIG.theme.actionColor,
      ),
    },
    defaults: {
      locale: envOrDefault("TRADESSTACK_DEFAULT_LOCALE", MASTER_CLIENT_CONFIG.defaults.locale),
      currency: envOrDefault("TRADESSTACK_DEFAULT_CURRENCY", MASTER_CLIENT_CONFIG.defaults.currency),
      timezone: envOrDefault("TRADESSTACK_DEFAULT_TIMEZONE", MASTER_CLIENT_CONFIG.defaults.timezone),
    },
  });
}
