import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createXeroContacts, XeroRequestError } from "@/lib/xero/client";
import {
  normalizeXeroContact,
  type ExternalContactLinkRow,
  type ImportedXeroContactRow,
} from "@/lib/xero/contacts";
import { getFreshXeroAccessToken, getOrganizationXeroConnection } from "@/lib/xero/service";
import type { XeroContact } from "@/lib/xero/types";

type UntypedSupabase = {
  // The generic Contact tables predate the generated client types used by this branch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type ClientXeroConnectionStatus =
  | "disconnected"
  | "pending_authorization"
  | "awaiting_tenant_selection"
  | "connected"
  | "attention_required"
  | "error";

export type ClientXeroContactChoice = {
  importedContactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  accountNumber: string | null;
  contactStatus: string | null;
  isCustomer: boolean | null;
  matchLabel: "strong" | "possible";
  reasons: string[];
  linkedClientId: string | null;
};

export type ClientXeroLinkWorkspaceData = {
  clientId: string;
  clientName: string;
  connectionStatus: ClientXeroConnectionStatus;
  importedContactCount: number;
  lastContactsSyncAt: string | null;
  currentLink: {
    id: string;
    status: "linked" | "external_archived" | "attention_required";
    externalContactName: string | null;
    externalContactStatus: string | null;
    linkedAt: string | null;
    lastSyncedAt: string | null;
    lastErrorMessage: string | null;
  } | null;
  suggestions: ClientXeroContactChoice[];
  searchResults: ClientXeroContactChoice[];
};

export type ClientXeroSourceClient = {
  id: string;
  organization_id: string;
  name: string;
  company_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  payment_terms_days: number | null;
};

export type ClientXeroSourceLocation = {
  address_line_1: string;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
};

function adminDb(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedSupabase;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D+/g, "");
}

function firstPresent(...values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? null;
}

function clientDisplayName(client: Pick<ClientXeroSourceClient, "company_name" | "name">) {
  return firstPresent(client.company_name, client.name) ?? "Unnamed client";
}

function safeCreateContactError(error: unknown) {
  if (!(error instanceof XeroRequestError)) {
    return "Xero returned an unexpected response while creating the contact. Retry shortly.";
  }
  if (error.status === 401) return "Reconnect Xero and try creating the contact again.";
  if (error.status === 403) return "Xero denied access to contact creation for this connection.";
  if (error.status === 429) return "Xero rate limited contact creation. Retry shortly.";
  if (error.status >= 400 && error.status < 500) {
    return error.message || "Xero rejected the client contact details.";
  }
  return "Xero returned an unexpected response while creating the contact. Retry shortly.";
}

async function getClientOrThrow(organizationId: string, clientId: string) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_clients")
    .select("id, organization_id, name, company_name, first_name, last_name, email, phone, payment_terms_days")
    .eq("organization_id", organizationId)
    .eq("id", clientId)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Client not found for this organization.");
  return result.data as ClientXeroSourceClient;
}

/**
 * Resolves the invoiced client identity from a claim without deriving any invoice
 * readiness or payload data. Keeping this resolver here makes the Stage 2 identity
 * boundary reusable by a later stage without introducing that later workflow now.
 */
export async function resolveProjectClaimClientForXeroContact(params: {
  organizationId: string;
  projectClaimId: string;
}) {
  const admin = adminDb(await createAdminSupabaseClient());
  const claimResult = await admin
    .from("project_claims")
    .select("id, project_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.projectClaimId)
    .maybeSingle();
  if (claimResult.error) throw new Error(claimResult.error.message);
  if (!claimResult.data?.project_id) {
    throw new Error("Payment Claim not found for this organization.");
  }

  const projectResult = await admin
    .from("organization_projects")
    .select("id, client_id")
    .eq("organization_id", params.organizationId)
    .eq("id", claimResult.data.project_id)
    .maybeSingle();
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (!projectResult.data?.client_id) {
    throw new Error("The Payment Claim project does not have an organization client.");
  }

  const client = await getClientOrThrow(params.organizationId, projectResult.data.client_id);
  return {
    projectClaimId: claimResult.data.id as string,
    projectId: projectResult.data.id as string,
    clientId: client.id,
  };
}

async function getPrimaryClientLocation(organizationId: string, clientId: string) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_client_locations")
    .select("address_line_1, city, region, postal_code, country")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? null) as ClientXeroSourceLocation | null;
}

async function getActiveContext(organizationId: string) {
  const connection = await getOrganizationXeroConnection(organizationId);
  if (!connection?.id || connection.status !== "connected" || !connection.tenant_id) {
    throw new Error("Connect Xero and select an active tenant before managing client contacts.");
  }
  return connection;
}

async function getActiveClientLink(organizationId: string, clientId: string) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_external_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "xero")
    .eq("local_entity_type", "client")
    .eq("local_entity_id", clientId)
    .in("link_status", ["linked", "attention_required", "external_archived"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? null) as ExternalContactLinkRow | null;
}

async function getActiveClientLinksForOrganization(organizationId: string) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_external_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "xero")
    .eq("local_entity_type", "client")
    .in("link_status", ["linked", "attention_required", "external_archived"]);

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as ExternalContactLinkRow[];
}

async function getImportedContacts(organizationId: string, connectionId: string, tenantId: string) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_xero_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("connection_id", connectionId)
    .eq("tenant_id", tenantId);

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as ImportedXeroContactRow[];
}

async function getImportedContactByRecordId(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
  importedContactId: string;
}) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_xero_contacts")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("connection_id", params.connectionId)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.importedContactId)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  if (!result.data) {
    throw new Error("The selected Xero contact is not available in the active connection and tenant.");
  }
  const contact = result.data as ImportedXeroContactRow;
  if (contact.contact_status === "ARCHIVED" || contact.contact_status === "GDPRREQUEST") {
    throw new Error("Archived Xero contacts cannot be linked to a client.");
  }
  return contact;
}

async function getImportedContactByContactId(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
  contactId: string;
}) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_xero_contacts")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("connection_id", params.connectionId)
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", params.contactId)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("The created Xero contact is not available in the active tenant cache.");
  return result.data as ImportedXeroContactRow;
}

function getMatchReasons(client: ClientXeroSourceClient, contact: ImportedXeroContactRow) {
  const reasons: string[] = [];
  const clientName = normalizeText(clientDisplayName(client));
  const contactName = normalizeText(contact.name);
  if (clientName && clientName === contactName) reasons.push("Exact client name");
  if (client.email && normalizeText(client.email) === normalizeText(contact.email)) reasons.push("Exact email");
  const phone = normalizePhone(client.phone);
  if (phone && [normalizePhone(contact.phone), normalizePhone(contact.mobile)].includes(phone)) {
    reasons.push("Exact phone");
  }
  return reasons;
}

function rankSearchResult(contact: ImportedXeroContactRow, query: string) {
  const normalizedQuery = normalizeText(query);
  const phoneQuery = normalizePhone(query);
  const fields = [
    normalizeText(contact.name),
    normalizeText(contact.email),
    normalizeText(contact.account_number),
  ];
  let score = fields[0] === normalizedQuery
    ? 300
    : fields[0].startsWith(normalizedQuery)
      ? 200
      : fields[0].includes(normalizedQuery)
        ? 100
        : 0;
  if (fields[1] === normalizedQuery || fields[2] === normalizedQuery) score += 150;
  if (phoneQuery && [normalizePhone(contact.phone), normalizePhone(contact.mobile)].includes(phoneQuery)) score += 150;
  return score;
}

function toChoice(
  contact: ImportedXeroContactRow,
  linkedClientId: string | null,
  reasons: string[] = [],
): ClientXeroContactChoice {
  return {
    importedContactId: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    mobile: contact.mobile,
    accountNumber: contact.account_number,
    contactStatus: contact.contact_status,
    isCustomer: contact.is_customer,
    matchLabel: reasons.length >= 2 ? "strong" : "possible",
    reasons,
    linkedClientId,
  };
}

export function buildCreateContactPayloadFromClient(
  client: ClientXeroSourceClient,
  location: ClientXeroSourceLocation | null,
): XeroContact {
  const payload: XeroContact = { Name: clientDisplayName(client) };
  const firstName = client.first_name?.trim() || null;
  const lastName = client.last_name?.trim() || null;
  const email = client.email?.trim() || null;
  const phone = client.phone?.trim() || null;

  if (firstName) payload.FirstName = firstName;
  if (lastName) payload.LastName = lastName;
  if (email) payload.EmailAddress = email;
  if (phone) payload.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: phone }];
  if (firstName || lastName || email) {
    payload.ContactPersons = [{
      ...(firstName ? { FirstName: firstName } : {}),
      ...(lastName ? { LastName: lastName } : {}),
      ...(email ? { EmailAddress: email } : {}),
      IncludeInEmails: true,
    }];
  }
  if (location?.address_line_1.trim()) {
    payload.Addresses = [{
      AddressType: "STREET",
      AddressLine1: location.address_line_1.trim(),
      ...(location.city?.trim() ? { City: location.city.trim() } : {}),
      ...(location.region?.trim() ? { Region: location.region.trim() } : {}),
      ...(location.postal_code?.trim() ? { PostalCode: location.postal_code.trim() } : {}),
      ...(location.country?.trim() ? { Country: location.country.trim() } : {}),
    }];
  }
  if (typeof client.payment_terms_days === "number" && client.payment_terms_days >= 0) {
    payload.PaymentTerms = {
      Sales: { Type: "DAYSAFTERBILLDATE", Day: client.payment_terms_days },
    };
  }
  return payload;
}

export async function loadClientXeroLinkWorkspaceData(params: {
  organizationId: string;
  clientId: string;
  searchTerm?: string | null;
}): Promise<ClientXeroLinkWorkspaceData> {
  const [client, connection, currentLink] = await Promise.all([
    getClientOrThrow(params.organizationId, params.clientId),
    getOrganizationXeroConnection(params.organizationId),
    getActiveClientLink(params.organizationId, params.clientId),
  ]);

  if (!connection?.id || !connection.tenant_id) {
    return {
      clientId: client.id,
      clientName: clientDisplayName(client),
      connectionStatus: (connection?.status ?? "disconnected") as ClientXeroConnectionStatus,
      importedContactCount: 0,
      lastContactsSyncAt: connection?.last_contacts_sync_at ?? null,
      currentLink: currentLink ? {
        id: currentLink.id,
        status: "attention_required",
        externalContactName: currentLink.external_contact_name,
        externalContactStatus: currentLink.external_contact_status,
        linkedAt: currentLink.linked_at,
        lastSyncedAt: currentLink.last_synced_at,
        lastErrorMessage: "Reconnect Xero and select the linked tenant before using this client link.",
      } : null,
      suggestions: [],
      searchResults: [],
    };
  }

  const [contacts, links] = await Promise.all([
    getImportedContacts(params.organizationId, connection.id, connection.tenant_id),
    getActiveClientLinksForOrganization(params.organizationId),
  ]);
  const linkedClientIdByContactId = new Map(links.map((link) => [link.external_contact_id, link.local_entity_id]));
  const usableContacts = contacts.filter(
    (contact) => contact.contact_status !== "GDPRREQUEST" && contact.contact_status !== "ARCHIVED",
  );
  const suggestions = usableContacts
    .map((contact) => ({ contact, reasons: getMatchReasons(client, contact) }))
    .filter(({ reasons }) => reasons.length > 0)
    .sort((left, right) => right.reasons.length - left.reasons.length || left.contact.name.localeCompare(right.contact.name))
    .slice(0, 8)
    .map(({ contact, reasons }) => toChoice(
      contact,
      linkedClientIdByContactId.get(contact.contact_id) ?? null,
      reasons,
    ));
  const searchTerm = params.searchTerm?.trim() ?? "";
  const searchResults = searchTerm
    ? usableContacts
        .map((contact) => ({ contact, score: rankSearchResult(contact, searchTerm) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.contact.name.localeCompare(right.contact.name))
        .slice(0, 20)
        .map(({ contact }) => toChoice(contact, linkedClientIdByContactId.get(contact.contact_id) ?? null))
    : [];
  const linkMatchesContext = currentLink
    ? currentLink.accounting_connection_id === connection.id && currentLink.tenant_id === connection.tenant_id
    : false;

  return {
    clientId: client.id,
    clientName: clientDisplayName(client),
    connectionStatus: connection.status as ClientXeroConnectionStatus,
    importedContactCount: contacts.length,
    lastContactsSyncAt: connection.last_contacts_sync_at ?? null,
    currentLink: currentLink ? {
      id: currentLink.id,
      status: !linkMatchesContext || currentLink.link_status === "attention_required"
        ? "attention_required"
        : currentLink.link_status === "external_archived" || currentLink.external_contact_status === "ARCHIVED"
          ? "external_archived"
          : "linked",
      externalContactName: currentLink.external_contact_name,
      externalContactStatus: currentLink.external_contact_status,
      linkedAt: currentLink.linked_at,
      lastSyncedAt: currentLink.last_synced_at,
      lastErrorMessage: !linkMatchesContext
        ? "This link belongs to a different Xero connection or tenant. Relink it before use."
        : currentLink.last_error_message,
    } : null,
    suggestions,
    searchResults,
  };
}

async function insertClientLink(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
  clientId: string;
  contact: ImportedXeroContactRow;
  actorUserId: string;
  matchMethod: string;
}) {
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_external_contacts")
    .insert({
      organization_id: params.organizationId,
      accounting_connection_id: params.connectionId,
      provider: "xero",
      local_entity_type: "client",
      local_entity_id: params.clientId,
      tenant_id: params.tenantId,
      external_contact_id: params.contact.contact_id,
      external_contact_name: params.contact.name,
      external_contact_status: params.contact.contact_status,
      link_status: "linked",
      match_method: params.matchMethod,
      linked_by: params.actorUserId,
      linked_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (result.error || !result.data) {
    if (result.error?.code === "23505") {
      throw new Error("This client or Xero Contact already has an active link. Refresh and try again.");
    }
    throw new Error(result.error?.message ?? "Unable to create the client Xero contact link.");
  }
  return result.data as ExternalContactLinkRow;
}

export async function linkClientToImportedXeroContact(params: {
  organizationId: string;
  clientId: string;
  importedContactId: string;
  actorUserId: string;
  allowRelink?: boolean;
  matchMethod: "manual_search" | "suggested_match" | "manual_create" | "manual_relink";
}) {
  const connection = await getActiveContext(params.organizationId);
  const [client, contact, currentLink, links] = await Promise.all([
    getClientOrThrow(params.organizationId, params.clientId),
    getImportedContactByRecordId({
      organizationId: params.organizationId,
      connectionId: connection.id,
      tenantId: connection.tenant_id!,
      importedContactId: params.importedContactId,
    }),
    getActiveClientLink(params.organizationId, params.clientId),
    getActiveClientLinksForOrganization(params.organizationId),
  ]);
  const conflictingLink = links.find((link) =>
    link.external_contact_id === contact.contact_id && link.local_entity_id !== client.id,
  );
  if (conflictingLink) throw new Error("This Xero contact is already linked to another client.");

  const currentMatches = currentLink
    && currentLink.external_contact_id === contact.contact_id
    && currentLink.accounting_connection_id === connection.id
    && currentLink.tenant_id === connection.tenant_id;
  if (currentMatches) return currentLink;
  if (currentLink && !params.allowRelink) {
    throw new Error("This client is already linked to a Xero contact. Use relink to replace it.");
  }

  if (currentLink) {
    const admin = adminDb(await createAdminSupabaseClient());
    const unlinkResult = await admin
      .from("organization_external_contacts")
      .update({
        link_status: "unlinked_history",
        unlinked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentLink.id);
    if (unlinkResult.error) throw new Error(unlinkResult.error.message);
  }

  const newLink = await insertClientLink({
    organizationId: params.organizationId,
    connectionId: connection.id,
    tenantId: connection.tenant_id!,
    clientId: client.id,
    contact,
    actorUserId: params.actorUserId,
    matchMethod: params.matchMethod,
  });
  if (currentLink) {
    const admin = adminDb(await createAdminSupabaseClient());
    const result = await admin
      .from("organization_external_contacts")
      .update({ superseded_by_id: newLink.id, updated_at: new Date().toISOString() })
      .eq("id", currentLink.id);
    if (result.error) throw new Error(result.error.message);
  }
  return newLink;
}

export async function unlinkClientXeroContact(params: {
  organizationId: string;
  clientId: string;
}) {
  await getClientOrThrow(params.organizationId, params.clientId);
  const currentLink = await getActiveClientLink(params.organizationId, params.clientId);
  if (!currentLink) return null;
  const admin = adminDb(await createAdminSupabaseClient());
  const result = await admin
    .from("organization_external_contacts")
    .update({
      link_status: "unlinked_history",
      unlinked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", currentLink.id);
  if (result.error) throw new Error(result.error.message);
  return currentLink;
}

function operationKey(params: {
  organizationId: string;
  tenantId: string;
  clientId: string;
  payload: XeroContact;
}) {
  const fingerprint = createHash("sha256").update(JSON.stringify(params.payload)).digest("hex").slice(0, 16);
  return `xero:create-contact:${params.organizationId}:${params.tenantId}:client:${params.clientId}:${fingerprint}`;
}

export async function createAndLinkXeroContactFromClient(params: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
  allowPotentialDuplicate: boolean;
}) {
  const connection = await getActiveContext(params.organizationId);
  const [client, location, currentLink] = await Promise.all([
    getClientOrThrow(params.organizationId, params.clientId),
    getPrimaryClientLocation(params.organizationId, params.clientId),
    getActiveClientLink(params.organizationId, params.clientId),
  ]);
  if (currentLink) throw new Error("This client is already linked to a Xero contact.");

  const workspace = await loadClientXeroLinkWorkspaceData({
    organizationId: params.organizationId,
    clientId: params.clientId,
  });
  if (workspace.suggestions.length > 0 && !params.allowPotentialDuplicate) {
    return { ok: false as const, requiresDuplicateConfirmation: true, suggestions: workspace.suggestions };
  }

  const payload = buildCreateContactPayloadFromClient(client, location);
  const key = operationKey({
    organizationId: params.organizationId,
    tenantId: connection.tenant_id!,
    clientId: params.clientId,
    payload,
  });
  const idempotencyKey = createHash("sha256").update(key).digest("hex").slice(0, 64);
  const admin = adminDb(await createAdminSupabaseClient());
  const existingResult = await admin
    .from("organization_external_contact_operations")
    .select("*")
    .eq("operation_key", key)
    .maybeSingle();
  if (existingResult.error) throw new Error(existingResult.error.message);
  const existing = existingResult.data as Record<string, unknown> | null;

  if (existing?.status === "succeeded" && typeof existing.external_contact_id === "string") {
    const imported = await getImportedContactByContactId({
      organizationId: params.organizationId,
      connectionId: connection.id,
      tenantId: connection.tenant_id!,
      contactId: existing.external_contact_id,
    });
    const link = await linkClientToImportedXeroContact({
      organizationId: params.organizationId,
      clientId: params.clientId,
      importedContactId: imported.id,
      actorUserId: params.actorUserId,
      matchMethod: "manual_create",
    });
    return { ok: true as const, linkId: link.id };
  }

  if (!existing) {
    const insertResult = await admin
      .from("organization_external_contact_operations")
      .insert({
        organization_id: params.organizationId,
        accounting_connection_id: connection.id,
        provider: "xero",
        local_entity_type: "client",
        local_entity_id: params.clientId,
        tenant_id: connection.tenant_id,
        operation_type: "create_contact",
        operation_key: key,
        status: "pending",
        created_by: params.actorUserId,
        request_summary: {
          clientName: clientDisplayName(client),
          email: client.email,
          phone: client.phone,
        },
      });
    if (insertResult.error) throw new Error(insertResult.error.message);
  }

  const { tokenSet } = await getFreshXeroAccessToken(params.organizationId);
  try {
    const created = await createXeroContacts({
      accessToken: tokenSet.access_token,
      tenantId: connection.tenant_id!,
      contacts: [payload],
      summarizeErrors: true,
      idempotencyKey,
    });
    const normalized = normalizeXeroContact(created[0] ?? null);
    if (!normalized) throw new Error("Xero did not return a valid ContactID for the created client contact.");

    const upsertResult = await admin
      .from("organization_xero_contacts")
      .upsert({
        organization_id: params.organizationId,
        connection_id: connection.id,
        tenant_id: connection.tenant_id,
        contact_id: normalized.contact_id,
        name: normalized.name,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        email: normalized.email,
        phone: normalized.phone,
        mobile: normalized.mobile,
        account_number: normalized.account_number,
        tax_number: normalized.tax_number,
        contact_status: normalized.contact_status,
        is_supplier: normalized.is_supplier,
        is_customer: normalized.is_customer,
        external_updated_at: normalized.external_updated_at,
        imported_at: new Date().toISOString(),
        addresses_json: normalized.addresses_json,
        phones_json: normalized.phones_json,
        raw_metadata: normalized.raw_metadata,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,tenant_id,contact_id" });
    if (upsertResult.error) throw new Error(upsertResult.error.message);

    const operationResult = await admin
      .from("organization_external_contact_operations")
      .update({
        status: "succeeded",
        external_contact_id: normalized.contact_id,
        response_summary: { contactId: normalized.contact_id, name: normalized.name },
        error_code: null,
        error_message: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("operation_key", key);
    if (operationResult.error) throw new Error(operationResult.error.message);

    const imported = await getImportedContactByContactId({
      organizationId: params.organizationId,
      connectionId: connection.id,
      tenantId: connection.tenant_id!,
      contactId: normalized.contact_id,
    });
    const link = await linkClientToImportedXeroContact({
      organizationId: params.organizationId,
      clientId: params.clientId,
      importedContactId: imported.id,
      actorUserId: params.actorUserId,
      matchMethod: "manual_create",
    });
    return { ok: true as const, linkId: link.id };
  } catch (error) {
    const safeMessage = safeCreateContactError(error);
    const errorCode = error instanceof XeroRequestError && error.status === 401
      ? "xero_connection"
      : error instanceof XeroRequestError && error.status === 403
        ? "xero_permission"
        : error instanceof XeroRequestError && error.status === 429
          ? "xero_rate_limit"
          : error instanceof XeroRequestError && error.status >= 400 && error.status < 500
            ? "xero_validation"
            : "xero_unknown";
    await admin
      .from("organization_external_contact_operations")
      .update({
        status: errorCode === "xero_unknown" ? "uncertain" : "failed",
        error_code: errorCode,
        error_message: safeMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("operation_key", key);
    throw new Error(safeMessage);
  }
}
