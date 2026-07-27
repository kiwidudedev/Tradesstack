import { parseXeroEncryptionKey } from "@/lib/xero/crypto";

export const DEFAULT_XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.settings",
  "accounting.contacts",
  "accounting.invoices",
  "accounting.attachments",
  "offline_access",
] as const;

const REQUIRED_XERO_SCOPES = new Set(DEFAULT_XERO_SCOPES);

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function parseScopes(value: string | undefined) {
  const scopes = (value ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const resolvedScopes = scopes.length > 0 ? scopes : [...DEFAULT_XERO_SCOPES];

  for (const requiredScope of REQUIRED_XERO_SCOPES) {
    if (!resolvedScopes.includes(requiredScope)) {
      throw new Error(`XERO_SCOPES must include ${requiredScope}.`);
    }
  }

  return resolvedScopes;
}

function parseRequiredAbsoluteUrl(name: string) {
  const value = readRequiredEnv(name);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (!url.protocol || !url.host) {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  return url;
}

function validateCronSecret(value: string) {
  if (value.length < 24) {
    throw new Error("CRON_SECRET must be at least 24 characters long.");
  }

  return value;
}

export function getXeroEnv() {
  const siteUrl = parseRequiredAbsoluteUrl("NEXT_PUBLIC_SITE_URL");
  const redirectUrl = parseRequiredAbsoluteUrl("XERO_REDIRECT_URI");
  const tokenEncryptionKey = readRequiredEnv("XERO_TOKEN_ENCRYPTION_KEY");
  parseXeroEncryptionKey(tokenEncryptionKey);

  if (redirectUrl.origin !== siteUrl.origin) {
    throw new Error("XERO_REDIRECT_URI must share the same origin as NEXT_PUBLIC_SITE_URL.");
  }

  return {
    clientId: readRequiredEnv("XERO_CLIENT_ID"),
    clientSecret: readRequiredEnv("XERO_CLIENT_SECRET"),
    redirectUri: redirectUrl.toString(),
    siteUrl: siteUrl.toString(),
    scopes: parseScopes(process.env.XERO_SCOPES),
    tokenEncryptionKey,
  };
}

export function getCronEnv() {
  return {
    cronSecret: validateCronSecret(readRequiredEnv("CRON_SECRET")),
  };
}
