import type {
  XeroAccount,
  XeroAttachment,
  XeroConnection,
  XeroContact,
  XeroInvoice,
  XeroTaxRate,
  XeroTokenSet,
} from "@/lib/xero/types";
import { getXeroEnv } from "@/lib/xero/env";

const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_ACCOUNTING_API_BASE_URL = "https://api.xero.com/api.xro/2.0";

export class XeroRequestError extends Error {
  status: number;
  isRetryable: boolean;

  constructor(message: string, options: { status: number; isRetryable?: boolean }) {
    super(message);
    this.name = "XeroRequestError";
    this.status = options.status;
    this.isRetryable = options.isRetryable ?? (options.status === 429 || options.status >= 500);
  }
}

function normalizeScopes(scope: string | string[] | undefined) {
  if (Array.isArray(scope)) {
    return scope;
  }
  if (typeof scope === "string") {
    return scope
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isGenericXeroMessage(message: string | null | undefined) {
  const normalized = (message ?? "").trim().toLowerCase();
  return (
    !normalized
    || normalized === "a validation exception occurred"
    || normalized === "validation exception"
  );
}

function readMessageValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectXeroValidationMessages(value: unknown, messages: string[]) {
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const directMessage = readMessageValue(record.Message)
    ?? readMessageValue(record.message)
    ?? readMessageValue(record.Detail)
    ?? readMessageValue(record.detail);

  if (directMessage && !isGenericXeroMessage(directMessage) && !messages.includes(directMessage)) {
    messages.push(directMessage);
  }

  const validationErrors = record.ValidationErrors ?? record.validationErrors;
  if (Array.isArray(validationErrors)) {
    for (const entry of validationErrors) {
      const entryRecord = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      const message = readMessageValue(entryRecord?.Message) ?? readMessageValue(entryRecord?.message);
      if (message && !isGenericXeroMessage(message) && !messages.includes(message)) {
        messages.push(message);
      }
    }
  }

  const elements = record.Elements ?? record.elements;
  if (Array.isArray(elements)) {
    for (const element of elements) {
      collectXeroValidationMessages(element, messages);
    }
  }
}

async function throwIfNotOk(response: Response, fallbackMessage: string): Promise<never | void> {
  if (response.ok) {
    return;
  }

  const payload = await readJsonResponse(response);
  const validationMessages: string[] = [];
  collectXeroValidationMessages(payload, validationMessages);

  const errorDescription =
    payload && typeof payload === "object"
      ? readMessageValue((payload as Record<string, unknown>).error_description)
      : null;
  const topLevelMessage =
    payload && typeof payload === "object"
      ? readMessageValue((payload as Record<string, unknown>).Message)
        ?? readMessageValue((payload as Record<string, unknown>).message)
      : null;
  const responseTextMessage = typeof payload === "string" && payload.trim() ? payload.trim() : null;

  const message =
    validationMessages[0]
    ?? (errorDescription && !isGenericXeroMessage(errorDescription) ? errorDescription : null)
    ?? (topLevelMessage && !isGenericXeroMessage(topLevelMessage) ? topLevelMessage : null)
    ?? responseTextMessage
    ?? fallbackMessage;

  throw new XeroRequestError(message, {
    status: response.status,
  });
}

export function buildXeroAuthorizeUrl(state: string) {
  const env = getXeroEnv();
  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("scope", env.scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeXeroAuthorizationCode(code: string) {
  const env = getXeroEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.redirectUri,
    client_id: env.clientId,
    client_secret: env.clientSecret,
  });

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  await throwIfNotOk(response, "Xero authorization code exchange failed.");
  const payload = (await response.json()) as XeroTokenSet;
  return {
    ...payload,
    scope: normalizeScopes(payload.scope),
  };
}

export async function refreshXeroToken(refreshToken: string) {
  const env = getXeroEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
  });

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  await throwIfNotOk(response, "Xero token refresh failed.");
  const payload = (await response.json()) as XeroTokenSet;
  return {
    ...payload,
    scope: normalizeScopes(payload.scope),
  };
}

export async function listXeroConnections(accessToken: string) {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  await throwIfNotOk(response, "Unable to load Xero tenants.");
  const payload = (await response.json()) as Array<Record<string, unknown>>;

  return payload.map((row) => ({
    id: String(row.id ?? ""),
    tenantId: String(row.tenantId ?? ""),
    tenantName: String(row.tenantName ?? ""),
    tenantType: String(row.tenantType ?? ""),
    createdDateUtc: typeof row.createdDateUtc === "string" ? row.createdDateUtc : undefined,
    updatedDateUtc: typeof row.updatedDateUtc === "string" ? row.updatedDateUtc : undefined,
  })) satisfies XeroConnection[];
}

export async function disconnectXeroTenant(accessToken: string, connectionId: string) {
  const response = await fetch(`${XERO_CONNECTIONS_URL}/${connectionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  await throwIfNotOk(response, "Unable to disconnect the selected Xero tenant.");
}

async function getXeroAccountingCollection<T>(params: {
  accessToken: string;
  tenantId: string;
  path: string;
  collectionKey: string;
  fallbackMessage?: string;
  query?: Record<string, string | null | undefined>;
  method?: "GET" | "POST";
  body?: string | URLSearchParams | null;
  idempotencyKey?: string | null;
}) {
  const url = new URL(`${XERO_ACCOUNTING_API_BASE_URL}${params.path}`);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method: params.method ?? "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
      "xero-tenant-id": params.tenantId,
      ...(params.method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
    },
    body: params.body ?? undefined,
    cache: "no-store",
  });

  await throwIfNotOk(response, params.fallbackMessage ?? `Unable to load Xero ${params.collectionKey.toLowerCase()}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  const rows = payload[params.collectionKey];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function getXeroAccounts(accessToken: string, tenantId: string) {
  return getXeroAccountingCollection<XeroAccount>({
    accessToken,
    tenantId,
    path: "/Accounts",
    collectionKey: "Accounts",
  });
}

export async function getXeroTaxRates(accessToken: string, tenantId: string) {
  return getXeroAccountingCollection<XeroTaxRate>({
    accessToken,
    tenantId,
    path: "/TaxRates",
    collectionKey: "TaxRates",
  });
}

function toIsoHeaderValue(value: string | Date | null | undefined) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export async function getXeroContacts(
  accessToken: string,
  tenantId: string,
  params?: {
    ifModifiedSince?: string | Date | null;
    where?: string | null;
    order?: string | null;
    ids?: string[] | null;
    page?: number | null;
    includeArchived?: boolean | null;
    summaryOnly?: boolean | null;
    searchTerm?: string | null;
    pageSize?: number | null;
  },
) {
  const query: Record<string, string | null> = {
    where: params?.where ?? null,
    order: params?.order ?? null,
    IDs: params?.ids?.length ? params.ids.join(",") : null,
    page: typeof params?.page === "number" ? String(params.page) : null,
    includeArchived: typeof params?.includeArchived === "boolean" ? String(params.includeArchived) : null,
    summaryOnly: typeof params?.summaryOnly === "boolean" ? String(params.summaryOnly) : null,
    searchTerm: params?.searchTerm ?? null,
    pageSize: typeof params?.pageSize === "number" ? String(params.pageSize) : null,
  };
  const url = new URL(`${XERO_ACCOUNTING_API_BASE_URL}/Contacts`);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "xero-tenant-id": tenantId,
      ...(toIsoHeaderValue(params?.ifModifiedSince) ? { "If-Modified-Since": toIsoHeaderValue(params?.ifModifiedSince)! } : {}),
    },
    cache: "no-store",
  });

  await throwIfNotOk(response, "Unable to load Xero contacts.");
  const payload = (await response.json()) as Record<string, unknown>;
  const rows = payload.Contacts;
  return Array.isArray(rows) ? (rows as XeroContact[]) : [];
}

export async function createXeroContacts(params: {
  accessToken: string;
  tenantId: string;
  contacts: XeroContact[];
  summarizeErrors?: boolean;
  idempotencyKey?: string | null;
}) {
  return getXeroAccountingCollection<XeroContact>({
    accessToken: params.accessToken,
    tenantId: params.tenantId,
    path: "/Contacts",
    collectionKey: "Contacts",
    method: "POST",
    body: JSON.stringify({
      Contacts: params.contacts,
    }),
    query: {
      summarizeErrors: typeof params.summarizeErrors === "boolean" ? String(params.summarizeErrors) : null,
    },
    idempotencyKey: params.idempotencyKey ?? null,
    fallbackMessage: "Unable to create the Xero contact.",
  });
}

export async function createXeroInvoices(params: {
  accessToken: string;
  tenantId: string;
  invoices: XeroInvoice[];
  idempotencyKey: string;
  fallbackMessage?: string;
}) {
  return getXeroAccountingCollection<XeroInvoice>({
    accessToken: params.accessToken,
    tenantId: params.tenantId,
    path: "/Invoices",
    collectionKey: "Invoices",
    method: "POST",
    body: JSON.stringify({ Invoices: params.invoices }),
    query: {
      summarizeErrors: "true",
      unitdp: "4",
    },
    idempotencyKey: params.idempotencyKey,
    fallbackMessage: params.fallbackMessage ?? "Unable to create the Draft Xero Bill.",
  });
}

export async function updateXeroSalesInvoice(params: {
  accessToken: string;
  tenantId: string;
  invoiceId: string;
  invoice: XeroInvoice;
  idempotencyKey: string;
}) {
  const invoiceId = params.invoiceId.trim();
  if (!invoiceId) {
    throw new Error("A Xero InvoiceID is required to update a Sales Invoice.");
  }

  return getXeroAccountingCollection<XeroInvoice>({
    accessToken: params.accessToken,
    tenantId: params.tenantId,
    path: `/Invoices/${encodeURIComponent(invoiceId)}`,
    collectionKey: "Invoices",
    method: "POST",
    body: JSON.stringify({
      Invoices: [{ ...params.invoice, InvoiceID: invoiceId }],
    }),
    query: {
      summarizeErrors: "true",
      unitdp: "4",
    },
    idempotencyKey: params.idempotencyKey,
    fallbackMessage: "Unable to update the linked Xero Sales Invoice.",
  });
}

export async function findXeroInvoicesByNumber(params: {
  accessToken: string;
  tenantId: string;
  invoiceNumber: string;
  type: "ACCPAY" | "ACCREC";
}) {
  return getXeroAccountingCollection<XeroInvoice>({
    accessToken: params.accessToken,
    tenantId: params.tenantId,
    path: "/Invoices",
    collectionKey: "Invoices",
    query: {
      InvoiceNumbers: params.invoiceNumber,
      where: `Type==\"${params.type}\"`,
      summaryOnly: "true",
      unitdp: "4",
    },
    fallbackMessage: "Unable to recover the Xero invoice by invoice number.",
  });
}

export async function getXeroInvoice(
  accessToken: string,
  tenantId: string,
  invoiceId: string,
) {
  return getXeroAccountingCollection<XeroInvoice>({
    accessToken,
    tenantId,
    path: `/Invoices/${encodeURIComponent(invoiceId)}`,
    collectionKey: "Invoices",
    query: {
      unitdp: "4",
    },
    fallbackMessage: "Unable to retrieve the Draft Xero Bill.",
  });
}

export async function getXeroInvoiceAttachments(params: {
  accessToken: string;
  tenantId: string;
  invoiceId: string;
}) {
  const invoiceId = params.invoiceId.trim();
  if (!invoiceId) throw new Error("A Xero InvoiceID is required to load attachments.");
  return getXeroAccountingCollection<XeroAttachment>({
    accessToken: params.accessToken,
    tenantId: params.tenantId,
    path: `/Invoices/${encodeURIComponent(invoiceId)}/Attachments`,
    collectionKey: "Attachments",
    fallbackMessage: "Unable to load Xero Sales Invoice attachments.",
  });
}

export async function putXeroInvoiceAttachment(params: {
  accessToken: string;
  tenantId: string;
  invoiceId: string;
  fileName: string;
  bytes: Uint8Array;
  includeOnline?: boolean;
}) {
  const invoiceId = params.invoiceId.trim();
  const fileName = params.fileName.trim();
  if (!invoiceId) throw new Error("A Xero InvoiceID is required to upload an attachment.");
  if (!fileName) throw new Error("A filename is required to upload a Xero attachment.");
  const url = new URL(
    `${XERO_ACCOUNTING_API_BASE_URL}/Invoices/${encodeURIComponent(invoiceId)}/Attachments/${encodeURIComponent(fileName)}`,
  );
  if (params.includeOnline) url.searchParams.set("IncludeOnline", "true");
  const body = Uint8Array.from(params.bytes);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/pdf",
      "Content-Length": String(body.byteLength),
      "xero-tenant-id": params.tenantId,
    },
    body,
    cache: "no-store",
  });
  await throwIfNotOk(response, "Unable to attach the Payment Claim PDF in Xero.");
  const payload = (await response.json()) as Record<string, unknown>;
  const rows = payload.Attachments;
  return Array.isArray(rows) ? rows as XeroAttachment[] : [];
}
