import "server-only";

import { createHash } from "node:crypto";
import { getSupplierPrimaryEmail, getSupplierPrimaryPhone } from "@/lib/suppliers";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createXeroContacts, getXeroContacts, XeroRequestError } from "@/lib/xero/client";
import { getFreshXeroAccessToken, getOrganizationXeroConnection } from "@/lib/xero/service";
import type {
  XeroContact,
  XeroContactAddress,
  XeroContactPhone,
  XeroPaymentTermBill,
  XeroPaymentTermType,
} from "@/lib/xero/types";

export type ImportedXeroContactRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  tenant_id: string;
  contact_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  account_number: string | null;
  tax_number: string | null;
  contact_status: "ACTIVE" | "ARCHIVED" | "GDPRREQUEST" | null;
  is_supplier: boolean | null;
  is_customer: boolean | null;
  external_updated_at: string | null;
  imported_at: string;
  addresses_json: Array<Record<string, unknown>>;
  phones_json: Array<Record<string, unknown>>;
  raw_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExternalContactLinkRow = {
  id: string;
  organization_id: string;
  accounting_connection_id: string;
  provider: "xero";
  local_entity_type: "supplier" | "client";
  local_entity_id: string;
  tenant_id: string;
  external_contact_id: string;
  external_contact_name: string | null;
  external_contact_status: string | null;
  link_status: "linked" | "attention_required" | "external_archived" | "unlinked_history";
  match_method: string | null;
  linked_by: string | null;
  linked_at: string | null;
  unlinked_at: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierContactLinkActivityRow = {
  id: string;
  organization_id: string;
  supplier_id: string;
  external_contact_link_id: string | null;
  actor_user_id: string | null;
  action: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SupplierXeroStatus =
  | "unlinked"
  | "suggested"
  | "linked"
  | "external_archived"
  | "attention_required";

export type SupplierXeroSuggestion = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  accountNumber: string | null;
  contactStatus: string | null;
  matchLabel: "strong" | "possible";
  reasons: string[];
  linkedSupplierId: string | null;
};

export type SupplierXeroOverview = {
  connectionStatus: "disconnected" | "pending_authorization" | "awaiting_tenant_selection" | "connected" | "attention_required" | "error";
  lastContactsSyncAt: string | null;
  importedContactCount: number;
  latestContactSyncError: string | null;
  bySupplierId: Record<string, {
    status: SupplierXeroStatus;
    linkedContactId: string | null;
    linkedContactName: string | null;
    linkedContactStatus: string | null;
    suggestionCount: number;
    lastSyncedAt: string | null;
    lastErrorMessage: string | null;
  }>;
};

export type SupplierXeroLinkWorkspaceData = {
  supplierId: string;
  supplierName: string;
  connectionStatus: SupplierXeroOverview["connectionStatus"];
  importedContactCount: number;
  lastContactsSyncAt: string | null;
  currentLink: {
    id: string;
    status: SupplierXeroStatus;
    externalContactId: string;
    externalContactName: string | null;
    externalContactStatus: string | null;
    linkedAt: string | null;
    lastSyncedAt: string | null;
    lastErrorMessage: string | null;
  } | null;
  suggestions: SupplierXeroSuggestion[];
  searchResults: SupplierXeroSuggestion[];
  activity: SupplierContactLinkActivityRow[];
};

type SupplierRow = {
  id: string;
  organization_id: string;
  name: string;
  company_name: string;
  legal_name: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  company_registration_number: string | null;
  tax_number: string | null;
  tax_number_type: string | null;
  default_currency_code: string | null;
  payment_terms_type: string | null;
  payment_terms_day: number | null;
  default_payment_terms: string;
  is_active: boolean;
};

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

function firstPresentString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function firstPresentBoolean(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function getSupplierName(supplier: Pick<SupplierRow, "company_name" | "name">) {
  return firstPresentString(supplier.company_name, supplier.name) ?? "Unnamed supplier";
}

function getPhoneByType(phones: XeroContactPhone[], type: string) {
  const normalizedType = type.trim().toUpperCase();
  for (const phone of phones) {
    const phoneType = firstPresentString(phone.phoneType, phone.PhoneType)?.toUpperCase() ?? "";
    if (phoneType !== normalizedType) {
      continue;
    }

    const number = firstPresentString(phone.phoneNumber, phone.PhoneNumber) ?? "";
    const areaCode = firstPresentString(phone.phoneAreaCode, phone.PhoneAreaCode) ?? "";
    const countryCode = firstPresentString(phone.phoneCountryCode, phone.PhoneCountryCode) ?? "";
    const value = [countryCode, areaCode, number].filter(Boolean).join(" ").trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeXeroContact(contact: XeroContact | null | undefined) {
  if (!contact) {
    return null;
  }

  const contactId = firstPresentString(contact.contactID, contact.ContactID);
  const name = firstPresentString(contact.name, contact.Name);

  if (!contactId || !name) {
    return null;
  }

  const phones = Array.isArray(contact.Phones)
    ? contact.Phones
    : Array.isArray(contact.phones)
      ? contact.phones
      : [];
  const addresses = Array.isArray(contact.Addresses)
    ? contact.Addresses
    : Array.isArray(contact.addresses)
      ? contact.addresses
      : [];
  const phone = getPhoneByType(phones, "DEFAULT") ?? getPhoneByType(phones, "DDI") ?? getPhoneByType(phones, "MOBILE");
  const mobile = getPhoneByType(phones, "MOBILE");
  const email = firstPresentString(contact.emailAddress, contact.EmailAddress);
  const accountNumber = firstPresentString(contact.accountNumber, contact.AccountNumber, contact.contactNumber, contact.ContactNumber);
  const contactStatus = firstPresentString(contact.contactStatus, contact.ContactStatus);

  return {
    contact_id: contactId,
    name,
    first_name: firstPresentString(contact.firstName, contact.FirstName),
    last_name: firstPresentString(contact.lastName, contact.LastName),
    email,
    phone,
    mobile,
    account_number: accountNumber,
    tax_number: firstPresentString(contact.taxNumber, contact.TaxNumber),
    contact_status: (contactStatus?.toUpperCase() ?? null) as ImportedXeroContactRow["contact_status"],
    is_supplier: firstPresentBoolean(contact.isSupplier, contact.IsSupplier),
    is_customer: firstPresentBoolean(contact.isCustomer, contact.IsCustomer),
    external_updated_at: toIsoString(contact.updatedDateUTC ?? contact.UpdatedDateUTC),
    addresses_json: addresses as Array<Record<string, unknown>>,
    phones_json: phones as Array<Record<string, unknown>>,
    raw_metadata: {
      mergedToContactId: firstPresentString(contact.mergedToContactID, contact.MergedToContactID),
      companyNumber: firstPresentString(contact.companyNumber, contact.CompanyNumber),
      taxNumberType: firstPresentString(contact.taxNumberType, contact.TaxNumberType),
      hasValidationErrors: Boolean(contact.hasValidationErrors ?? contact.HasValidationErrors),
    },
  };
}

function mapAddressTextToXeroAddresses(address: string | null) {
  if (!address || !address.trim()) {
    return [];
  }

  const lines = address
    .split(/\r?\n|,\s*/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  return [
    {
      AddressType: "STREET",
      AddressLine1: lines[0] ?? "",
      ...(lines[1] ? { AddressLine2: lines[1] } : {}),
      ...(lines[2] ? { City: lines[2] } : {}),
    } satisfies Record<string, string>,
  ];
}

function mapStructuredAddressToXeroAddresses(supplier: SupplierRow) {
  if (!supplier.address_line_1?.trim()) {
    return [];
  }

  return [
    {
      AddressType: "STREET",
      AddressLine1: supplier.address_line_1.trim(),
      ...(supplier.address_line_2?.trim() ? { AddressLine2: supplier.address_line_2.trim() } : {}),
      ...(supplier.city?.trim() ? { City: supplier.city.trim() } : {}),
      ...(supplier.region?.trim() ? { Region: supplier.region.trim() } : {}),
      ...(supplier.postal_code?.trim() ? { PostalCode: supplier.postal_code.trim() } : {}),
      ...(supplier.country_code?.trim() ? { Country: supplier.country_code.trim() } : {}),
    } satisfies XeroContactAddress,
  ];
}

function mapPaymentTermsTypeToXero(value: string | null | undefined): XeroPaymentTermType | null {
  switch (value) {
    case "days_after_bill_date":
      return "DAYSAFTERBILLDATE";
    case "days_after_bill_month":
      return "DAYSAFTERBILLMONTH";
    case "of_current_month":
      return "OFCURRENTMONTH";
    case "of_following_month":
      return "OFFOLLOWINGMONTH";
    default:
      return null;
  }
}

function mapSupplierPaymentTermsToXero(supplier: SupplierRow): XeroPaymentTermBill | null {
  const mappedType = mapPaymentTermsTypeToXero(supplier.payment_terms_type);
  if (!mappedType) {
    return null;
  }

  return {
    Type: mappedType,
    ...(typeof supplier.payment_terms_day === "number" ? { Day: supplier.payment_terms_day } : {}),
  };
}

export function buildCreateContactPayload(supplier: SupplierRow): XeroContact {
  const payload: XeroContact = {
    Name: firstPresentString(supplier.legal_name, getSupplierName(supplier)) ?? getSupplierName(supplier),
  };

  if (supplier.primary_contact_first_name?.trim()) {
    payload.FirstName = supplier.primary_contact_first_name.trim();
  }

  if (supplier.primary_contact_last_name?.trim()) {
    payload.LastName = supplier.primary_contact_last_name.trim();
  }

  const email = getSupplierPrimaryEmail(supplier);
  if (email) {
    payload.EmailAddress = email;
  }

  const phone = getSupplierPrimaryPhone(supplier);
  if (phone) {
    payload.Phones = [
      {
        PhoneType: "DEFAULT",
        PhoneNumber: phone,
      },
    ];
  }

  const contactPerson =
    supplier.primary_contact_first_name?.trim() ||
    supplier.primary_contact_last_name?.trim() ||
    email
      ? {
          ...(supplier.primary_contact_first_name?.trim()
            ? { FirstName: supplier.primary_contact_first_name.trim() }
            : {}),
          ...(supplier.primary_contact_last_name?.trim()
            ? { LastName: supplier.primary_contact_last_name.trim() }
            : {}),
          ...(email ? { EmailAddress: email } : {}),
          IncludeInEmails: true,
        }
      : null;
  if (contactPerson) {
    payload.ContactPersons = [contactPerson];
  }

  if (supplier.company_registration_number?.trim()) {
    payload.CompanyNumber = supplier.company_registration_number.trim();
  }

  if (supplier.tax_number?.trim()) {
    payload.TaxNumber = supplier.tax_number.trim();
  }

  if (supplier.tax_number_type?.trim()) {
    payload.TaxNumberType = supplier.tax_number_type.trim();
  }

  if (supplier.default_currency_code?.trim()) {
    payload.DefaultCurrency = supplier.default_currency_code.trim().toUpperCase();
  }

  const structuredAddresses = mapStructuredAddressToXeroAddresses(supplier);
  const addresses =
    structuredAddresses.length > 0
      ? structuredAddresses
      : mapAddressTextToXeroAddresses(supplier.address);
  if (addresses.length > 0) {
    payload.Addresses = addresses as XeroContactAddress[];
  }

  const billTerms = mapSupplierPaymentTermsToXero(supplier);
  if (billTerms) {
    payload.PaymentTerms = {
      Bills: billTerms,
    };
  }

  return payload;
}

function buildOperationKey(params: {
  organizationId: string;
  tenantId: string;
  supplierId: string;
  payload: XeroContact;
}) {
  const payloadFingerprint = createHash("sha256")
    .update(JSON.stringify(params.payload))
    .digest("hex")
    .slice(0, 16);
  return `xero:create-contact:${params.organizationId}:${params.tenantId}:${params.supplierId}:${payloadFingerprint}`;
}

function buildIdempotencyKey(operationKey: string) {
  return createHash("sha256").update(operationKey).digest("hex").slice(0, 64);
}

function toSafeCreateContactError(error: unknown) {
  if (!(error instanceof XeroRequestError)) {
    return error instanceof Error
      ? error.message
      : "Xero returned an unexpected response while creating the contact. Retry shortly.";
  }

  if (error.status === 401) {
    return "Reconnect Xero and try creating the contact again.";
  }
  if (error.status === 403) {
    return "Xero denied access to contact creation for this connection.";
  }
  if (error.status === 429) {
    return "Xero rate limited contact creation. Retry shortly.";
  }
  if (error.status >= 400 && error.status < 500) {
    return error.message || "Xero rejected the contact details.";
  }

  return "Xero returned an unexpected response while creating the contact. Retry shortly.";
}

async function getAdmin() {
  return createAdminSupabaseClient();
}

function isMissingSchemaCacheTableError(message: string | null | undefined) {
  const value = (message ?? "").toLowerCase();
  return value.includes("schema cache") && value.includes("could not find the table");
}

async function getSupplierOrThrow(organizationId: string, supplierId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_suppliers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", supplierId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Supplier not found for this organization.");
  }

  return data as SupplierRow;
}

async function getActiveXeroContactContext(organizationId: string) {
  const connection = await getOrganizationXeroConnection(organizationId);
  if (!connection?.id || connection.status !== "connected" || !connection.tenant_id) {
    throw new Error("Connect Xero and select an active tenant before managing supplier contacts.");
  }

  return connection;
}

async function getImportedContactOrThrow(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
  contactId: string;
}) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_xero_contacts" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("connection_id", params.connectionId)
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", params.contactId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaCacheTableError(error.message)) {
      throw new Error("Xero contacts are still becoming available. Refresh in a moment and try again.");
    }
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("The selected Xero contact was not found in the current tenant cache. Refresh contacts and try again.");
  }

  return data as ImportedXeroContactRow;
}

async function getActiveSupplierLink(organizationId: string, supplierId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_external_contacts" as never)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "xero")
    .eq("local_entity_type", "supplier")
    .eq("local_entity_id", supplierId)
    .in("link_status", ["linked", "attention_required", "external_archived"] as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaCacheTableError(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  return (data ?? null) as ExternalContactLinkRow | null;
}

async function getActiveLinkForExternalContact(params: {
  organizationId: string;
  externalContactId: string;
  localEntityType: "supplier" | "client";
}) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_external_contacts" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .eq("local_entity_type", params.localEntityType)
    .eq("external_contact_id", params.externalContactId)
    .in("link_status", ["linked", "attention_required", "external_archived"] as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as ExternalContactLinkRow | null;
}

async function recordSupplierContactActivity(params: {
  organizationId: string;
  supplierId: string;
  externalContactLinkId?: string | null;
  actorUserId?: string | null;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = await getAdmin();
  const { error } = await admin
    .from("supplier_contact_link_activity" as never)
    .insert({
      organization_id: params.organizationId,
      supplier_id: params.supplierId,
      external_contact_link_id: params.externalContactLinkId ?? null,
      actor_user_id: params.actorUserId ?? null,
      action: params.action,
      message: params.message,
      metadata: params.metadata ?? {},
    } as never);

  if (error) {
    throw new Error(error.message);
  }
}

function getSuggestionReasons(params: {
  supplier: SupplierRow;
  contact: ImportedXeroContactRow;
}) {
  const supplierDisplayName = normalizeText(getSupplierName(params.supplier));
  const supplierLegalName = normalizeText(params.supplier.legal_name);
  const supplierEmail = normalizeText(params.supplier.email);
  const supplierPhone = normalizePhone(params.supplier.phone);
  const contactName = normalizeText(params.contact.name);
  const contactEmail = normalizeText(params.contact.email);
  const contactPhone = normalizePhone(params.contact.phone);
  const contactMobile = normalizePhone(params.contact.mobile);

  const reasons: string[] = [];
  let strongSignals = 0;

  if (supplierDisplayName && supplierDisplayName === contactName) {
    reasons.push("Exact supplier name");
    strongSignals += 1;
  } else if (supplierLegalName && supplierLegalName === contactName) {
    reasons.push("Exact legal name");
    strongSignals += 1;
  }

  if (supplierEmail && contactEmail && supplierEmail === contactEmail) {
    reasons.push("Exact email");
    strongSignals += 1;
  }

  if (supplierPhone && (supplierPhone === contactPhone || supplierPhone === contactMobile)) {
    reasons.push("Exact phone");
    strongSignals += 1;
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    label: strongSignals >= 2 ? ("strong" as const) : ("possible" as const),
    reasons,
  };
}

function toSuggestion(params: {
  supplier: SupplierRow;
  contact: ImportedXeroContactRow;
  linkedSupplierId: string | null;
}): SupplierXeroSuggestion | null {
  const signal = getSuggestionReasons({
    supplier: params.supplier,
    contact: params.contact,
  });

  if (!signal) {
    return null;
  }

  return {
    contactId: params.contact.contact_id,
    name: params.contact.name,
    email: params.contact.email,
    phone: params.contact.phone,
    mobile: params.contact.mobile,
    accountNumber: params.contact.account_number,
    contactStatus: params.contact.contact_status,
    matchLabel: signal.label,
    reasons: signal.reasons,
    linkedSupplierId: params.linkedSupplierId,
  } satisfies SupplierXeroSuggestion;
}

export function buildSupplierXeroSuggestions(params: {
  supplier: SupplierRow;
  contacts: ImportedXeroContactRow[];
  linkedSupplierIdByContactId?: Map<string, string>;
}) {
  const suggestions = params.contacts
    .map((contact) => toSuggestion({
      supplier: params.supplier,
      contact,
      linkedSupplierId: params.linkedSupplierIdByContactId?.get(contact.contact_id) ?? null,
    }))
    .filter((value): value is SupplierXeroSuggestion => value !== null);

  return suggestions.sort((left, right) => {
      if (left.matchLabel !== right.matchLabel) {
        return left.matchLabel === "strong" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

async function getImportedContactsForConnection(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
}) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_xero_contacts" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("connection_id", params.connectionId)
    .eq("tenant_id", params.tenantId);

  if (error) {
    if (isMissingSchemaCacheTableError(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []) as ImportedXeroContactRow[];
}

async function getActiveSupplierLinksForOrganization(organizationId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("organization_external_contacts" as never)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "xero")
    .eq("local_entity_type", "supplier")
    .in("link_status", ["linked", "attention_required", "external_archived"] as never);

  if (error) {
    if (isMissingSchemaCacheTableError(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []) as ExternalContactLinkRow[];
}

export async function getSupplierXeroOverview(params: {
  organizationId: string;
  suppliers: SupplierRow[];
}): Promise<SupplierXeroOverview> {
  const connection = await getOrganizationXeroConnection(params.organizationId);
  const importedContactCount = connection?.id
    ? ((await getAdmin())
      .from("organization_xero_contacts" as never)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organizationId)
      .eq("connection_id", connection.id))
      .then((result) => {
        if (result.error && isMissingSchemaCacheTableError(result.error.message)) {
          return 0;
        }
        if (result.error) {
          throw new Error(result.error.message);
        }
        return result.count ?? 0;
      })
    : 0;

  if (!connection?.id || !connection.tenant_id) {
    const emptyMap: SupplierXeroOverview["bySupplierId"] = Object.fromEntries(
      params.suppliers.map((supplier) => [supplier.id, {
        status: connection?.status === "attention_required" ? "attention_required" : "unlinked",
        linkedContactId: null,
        linkedContactName: null,
        linkedContactStatus: null,
        suggestionCount: 0,
        lastSyncedAt: null,
        lastErrorMessage: null,
      }]),
    );

    return {
      connectionStatus: connection?.status ?? "disconnected",
      lastContactsSyncAt: connection?.last_contacts_sync_at ?? null,
      importedContactCount: await importedContactCount,
      latestContactSyncError: null,
      bySupplierId: emptyMap,
    };
  }

  const admin = await getAdmin();
  const [contacts, links, latestJobResult] = await Promise.all([
    getImportedContactsForConnection({
      organizationId: params.organizationId,
      connectionId: connection.id,
      tenantId: connection.tenant_id,
    }),
    getActiveSupplierLinksForOrganization(params.organizationId),
    admin
      .from("organization_accounting_sync_jobs" as never)
      .select("last_error")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("job_kind", "import_contacts")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const linkBySupplierId = new Map(links.map((link) => [link.local_entity_id, link]));
  const linkedSupplierIdByContactId = new Map<string, string>();
  for (const link of links) {
    linkedSupplierIdByContactId.set(link.external_contact_id, link.local_entity_id);
  }

  const bySupplierId: SupplierXeroOverview["bySupplierId"] = {};
  for (const supplier of params.suppliers) {
    const activeLink = linkBySupplierId.get(supplier.id) ?? null;
    if (activeLink) {
      bySupplierId[supplier.id] = {
        status:
          activeLink.link_status === "external_archived"
            ? "external_archived"
            : activeLink.link_status === "attention_required"
              ? "attention_required"
              : "linked",
        linkedContactId: activeLink.external_contact_id,
        linkedContactName: activeLink.external_contact_name,
        linkedContactStatus: activeLink.external_contact_status,
        suggestionCount: 0,
        lastSyncedAt: activeLink.last_synced_at,
        lastErrorMessage: activeLink.last_error_message,
      };
      continue;
    }

    const suggestions = buildSupplierXeroSuggestions({
      supplier,
      contacts,
      linkedSupplierIdByContactId,
    }).filter((value) => value.linkedSupplierId == null || value.linkedSupplierId === supplier.id);

    bySupplierId[supplier.id] = {
      status:
        connection.status === "attention_required"
          ? "attention_required"
          : suggestions.length > 0
            ? "suggested"
            : "unlinked",
      linkedContactId: null,
      linkedContactName: null,
      linkedContactStatus: null,
      suggestionCount: suggestions.length,
      lastSyncedAt: null,
      lastErrorMessage: null,
    };
  }

  return {
    connectionStatus: connection.status,
    lastContactsSyncAt: connection.last_contacts_sync_at ?? null,
    importedContactCount: await importedContactCount,
    latestContactSyncError: (latestJobResult.data as { last_error?: string | null } | null)?.last_error ?? null,
    bySupplierId,
  };
}

function rankSearchResult(contact: ImportedXeroContactRow, query: string) {
  const normalizedQuery = normalizeText(query);
  const fields = [
    normalizeText(contact.name),
    normalizeText(contact.email),
    normalizeText(contact.account_number),
    normalizePhone(contact.phone),
    normalizePhone(contact.mobile),
  ];

  let score = 0;
  if (fields[0] === normalizedQuery) {
    score += 300;
  } else if (fields[0].startsWith(normalizedQuery)) {
    score += 200;
  } else if (fields[0].includes(normalizedQuery)) {
    score += 100;
  }

  if (fields[1] === normalizedQuery || fields[2] === normalizedQuery) {
    score += 150;
  }

  const phoneQuery = normalizePhone(query);
  if (phoneQuery && (fields[3] === phoneQuery || fields[4] === phoneQuery)) {
    score += 150;
  }

  return score;
}

export async function loadSupplierXeroLinkWorkspaceData(params: {
  organizationId: string;
  supplierId: string;
  searchTerm?: string | null;
}): Promise<SupplierXeroLinkWorkspaceData> {
  const supplier = await getSupplierOrThrow(params.organizationId, params.supplierId);
  const connection = await getOrganizationXeroConnection(params.organizationId);
  const currentLink = await getActiveSupplierLink(params.organizationId, params.supplierId);

  if (!connection?.id || !connection.tenant_id) {
    return {
      supplierId: supplier.id,
      supplierName: getSupplierName(supplier),
      connectionStatus: connection?.status ?? "disconnected",
      importedContactCount: 0,
      lastContactsSyncAt: connection?.last_contacts_sync_at ?? null,
      currentLink: currentLink
        ? {
            id: currentLink.id,
            status: currentLink.link_status === "external_archived" ? "external_archived" : "linked",
            externalContactId: currentLink.external_contact_id,
            externalContactName: currentLink.external_contact_name,
            externalContactStatus: currentLink.external_contact_status,
            linkedAt: currentLink.linked_at,
            lastSyncedAt: currentLink.last_synced_at,
            lastErrorMessage: currentLink.last_error_message,
          }
        : null,
      suggestions: [],
      searchResults: [],
      activity: [],
    };
  }

  const admin = await getAdmin();
  const [contacts, links, activityRows, contactCountResult] = await Promise.all([
    getImportedContactsForConnection({
      organizationId: params.organizationId,
      connectionId: connection.id,
      tenantId: connection.tenant_id,
    }),
    getActiveSupplierLinksForOrganization(params.organizationId),
    admin
      .from("supplier_contact_link_activity" as never)
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("supplier_id", params.supplierId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("organization_xero_contacts" as never)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organizationId)
      .eq("connection_id", connection.id),
  ]);

  if (activityRows.error) {
    throw new Error(activityRows.error.message);
  }
  if (contactCountResult.error && !isMissingSchemaCacheTableError(contactCountResult.error.message)) {
    throw new Error(contactCountResult.error.message);
  }

  const linkedSupplierIdByContactId = new Map<string, string>();
  for (const link of links) {
    linkedSupplierIdByContactId.set(link.external_contact_id, link.local_entity_id);
  }

  const suggestions = buildSupplierXeroSuggestions({
    supplier,
    contacts,
    linkedSupplierIdByContactId,
  }).slice(0, 8);

  const trimmedSearch = params.searchTerm?.trim() ?? "";
  const searchResults = trimmedSearch
    ? contacts
        .map((contact) => ({
          contact,
          score: rankSearchResult(contact, trimmedSearch),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
          if (left.score !== right.score) {
            return right.score - left.score;
          }
          return left.contact.name.localeCompare(right.contact.name);
        })
        .slice(0, 20)
        .map(({ contact }) => ({
          contactId: contact.contact_id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          mobile: contact.mobile,
          accountNumber: contact.account_number,
          contactStatus: contact.contact_status,
          matchLabel: "possible" as const,
          reasons: [],
          linkedSupplierId: linkedSupplierIdByContactId.get(contact.contact_id) ?? null,
        }))
    : [];

  return {
    supplierId: supplier.id,
    supplierName: getSupplierName(supplier),
    connectionStatus: connection.status,
    importedContactCount: contactCountResult.count ?? 0,
    lastContactsSyncAt: connection.last_contacts_sync_at ?? null,
    currentLink: currentLink
      ? {
          id: currentLink.id,
          status:
            currentLink.link_status === "external_archived"
              ? "external_archived"
              : currentLink.link_status === "attention_required"
                ? "attention_required"
                : "linked",
          externalContactId: currentLink.external_contact_id,
          externalContactName: currentLink.external_contact_name,
          externalContactStatus: currentLink.external_contact_status,
          linkedAt: currentLink.linked_at,
          lastSyncedAt: currentLink.last_synced_at,
          lastErrorMessage: currentLink.last_error_message,
        }
      : null,
    suggestions,
    searchResults,
    activity: (activityRows.data ?? []) as SupplierContactLinkActivityRow[],
  };
}

export async function importXeroContacts(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
}) {
  const freshTokenState = await getFreshXeroAccessToken(params.organizationId);
  const pageSize = 100;
  const contacts: ImportedXeroContactRow[] = [];
  let page = 1;

  while (true) {
    const batch = await getXeroContacts(freshTokenState.tokenSet.access_token, params.tenantId, {
      page,
      pageSize,
      includeArchived: true,
    });

    if (batch.length === 0) {
      break;
    }

    for (const contact of batch) {
      const normalized = normalizeXeroContact(contact);
      if (!normalized) {
        continue;
      }

      contacts.push({
        id: "",
        organization_id: params.organizationId,
        connection_id: params.connectionId,
        tenant_id: params.tenantId,
        imported_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...normalized,
      });
    }

    if (batch.length < pageSize) {
      break;
    }
    page += 1;
  }

  const admin = await getAdmin();
  if (contacts.length > 0) {
    const upsertRows = contacts.map((contact) => ({
      organization_id: contact.organization_id,
      connection_id: contact.connection_id,
      tenant_id: contact.tenant_id,
      contact_id: contact.contact_id,
      name: contact.name,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      account_number: contact.account_number,
      tax_number: contact.tax_number,
      contact_status: contact.contact_status,
      is_supplier: contact.is_supplier,
      is_customer: contact.is_customer,
      external_updated_at: contact.external_updated_at,
      imported_at: new Date().toISOString(),
      addresses_json: contact.addresses_json,
      phones_json: contact.phones_json,
      raw_metadata: contact.raw_metadata,
      updated_at: new Date().toISOString(),
    }));

    const upsertResult = await admin
      .from("organization_xero_contacts" as never)
      .upsert(upsertRows as never, {
        onConflict: "organization_id,tenant_id,contact_id",
      });

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }
  }

  const links = await getActiveSupplierLinksForOrganization(params.organizationId);
  const importedByContactId = new Map(contacts.map((contact) => [contact.contact_id, contact]));

  for (const link of links) {
    const imported = importedByContactId.get(link.external_contact_id);
    if (!imported) {
      continue;
    }

    const nextLinkStatus = imported.contact_status === "ARCHIVED" ? "external_archived" : "linked";
    const updateResult = await admin
      .from("organization_external_contacts" as never)
      .update({
        external_contact_name: imported.name,
        external_contact_status: imported.contact_status,
        link_status: nextLinkStatus,
        last_synced_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", link.id);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  }

  const connectionUpdate = await admin
    .from("organization_xero_connections" as never)
    .update({
      last_contacts_sync_at: new Date().toISOString(),
      last_sync_completed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", params.connectionId)
    .eq("organization_id", params.organizationId);

  if (connectionUpdate.error) {
    throw new Error(connectionUpdate.error.message);
  }

  return {
    importedCount: contacts.length,
    fetchedCount: contacts.length,
  };
}

async function insertSupplierLink(params: {
  organizationId: string;
  connectionId: string;
  tenantId: string;
  supplierId: string;
  externalContactId: string;
  externalContactName: string | null;
  externalContactStatus: string | null;
  linkedBy: string;
  matchMethod: string;
}) {
  const admin = await getAdmin();
  const linkStatus = params.externalContactStatus === "ARCHIVED" ? "external_archived" : "linked";
  const { data, error } = await admin
    .from("organization_external_contacts" as never)
    .insert({
      organization_id: params.organizationId,
      accounting_connection_id: params.connectionId,
      provider: "xero",
      local_entity_type: "supplier",
      local_entity_id: params.supplierId,
      tenant_id: params.tenantId,
      external_contact_id: params.externalContactId,
      external_contact_name: params.externalContactName,
      external_contact_status: params.externalContactStatus,
      link_status: linkStatus,
      match_method: params.matchMethod,
      linked_by: params.linkedBy,
      linked_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create the supplier contact link.");
  }

  return data as ExternalContactLinkRow;
}

export async function linkSupplierToImportedXeroContact(params: {
  organizationId: string;
  supplierId: string;
  contactId: string;
  actorUserId: string;
  matchMethod: "manual_search" | "suggested_match" | "manual_create" | "manual_relink";
  allowRelink?: boolean;
}) {
  const connection = await getActiveXeroContactContext(params.organizationId);
  const [supplier, importedContact, currentLink, conflictingLink] = await Promise.all([
    getSupplierOrThrow(params.organizationId, params.supplierId),
    getImportedContactOrThrow({
      organizationId: params.organizationId,
      connectionId: connection.id,
      tenantId: connection.tenant_id!,
      contactId: params.contactId,
    }),
    getActiveSupplierLink(params.organizationId, params.supplierId),
    getActiveLinkForExternalContact({
      organizationId: params.organizationId,
      externalContactId: params.contactId,
      localEntityType: "supplier",
    }),
  ]);

  if (currentLink?.external_contact_id === params.contactId) {
    return currentLink;
  }

  if (conflictingLink && conflictingLink.local_entity_id !== params.supplierId) {
    throw new Error("This Xero contact is already linked to another supplier.");
  }

  if (currentLink && !params.allowRelink) {
    throw new Error("This supplier is already linked to a Xero contact. Use relink to replace it.");
  }

  let previousLinkId: string | null = null;
  if (currentLink && params.allowRelink) {
    previousLinkId = currentLink.id;
    const admin = await getAdmin();
    const unlinkResult = await admin
      .from("organization_external_contacts" as never)
      .update({
        link_status: "unlinked_history",
        unlinked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", currentLink.id);

    if (unlinkResult.error) {
      throw new Error(unlinkResult.error.message);
    }
  }

  const newLink = await insertSupplierLink({
    organizationId: params.organizationId,
    connectionId: connection.id,
    tenantId: connection.tenant_id!,
    supplierId: supplier.id,
    externalContactId: importedContact.contact_id,
    externalContactName: importedContact.name,
    externalContactStatus: importedContact.contact_status,
    linkedBy: params.actorUserId,
    matchMethod: params.matchMethod,
  });

  if (previousLinkId) {
    const admin = await getAdmin();
    await admin
      .from("organization_external_contacts" as never)
      .update({
        superseded_by_id: newLink.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", previousLinkId);
  }

  await recordSupplierContactActivity({
    organizationId: params.organizationId,
    supplierId: supplier.id,
    externalContactLinkId: newLink.id,
    actorUserId: params.actorUserId,
    action: params.allowRelink ? "supplier_relinked" : "supplier_linked",
    message: params.allowRelink
      ? `Linked ${getSupplierName(supplier)} to Xero contact ${importedContact.name}.`
      : `Linked ${getSupplierName(supplier)} to Xero contact ${importedContact.name}.`,
    metadata: {
      externalContactId: importedContact.contact_id,
      externalContactStatus: importedContact.contact_status,
      matchMethod: params.matchMethod,
    },
  });

  return newLink;
}

export async function unlinkSupplierXeroContact(params: {
  organizationId: string;
  supplierId: string;
  actorUserId: string;
}) {
  const supplier = await getSupplierOrThrow(params.organizationId, params.supplierId);
  const currentLink = await getActiveSupplierLink(params.organizationId, params.supplierId);
  if (!currentLink) {
    return null;
  }

  const admin = await getAdmin();
  const { error } = await admin
    .from("organization_external_contacts" as never)
    .update({
      link_status: "unlinked_history",
      unlinked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", currentLink.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordSupplierContactActivity({
    organizationId: params.organizationId,
    supplierId: params.supplierId,
    externalContactLinkId: currentLink.id,
    actorUserId: params.actorUserId,
    action: "supplier_unlinked",
    message: `Unlinked ${getSupplierName(supplier)} from Xero contact ${currentLink.external_contact_name ?? currentLink.external_contact_id}.`,
    metadata: {
      externalContactId: currentLink.external_contact_id,
    },
  });

  return currentLink;
}

export async function createAndLinkXeroContactFromSupplier(params: {
  organizationId: string;
  supplierId: string;
  actorUserId: string;
  allowPotentialDuplicate: boolean;
}) {
  const connection = await getActiveXeroContactContext(params.organizationId);
  const supplier = await getSupplierOrThrow(params.organizationId, params.supplierId);
  const currentLink = await getActiveSupplierLink(params.organizationId, params.supplierId);
  if (currentLink) {
    throw new Error("This supplier is already linked to a Xero contact.");
  }

  const workspaceData = await loadSupplierXeroLinkWorkspaceData({
    organizationId: params.organizationId,
    supplierId: params.supplierId,
  });

  if (workspaceData.suggestions.length > 0 && !params.allowPotentialDuplicate) {
    return {
      ok: false as const,
      requiresDuplicateConfirmation: true,
      suggestions: workspaceData.suggestions,
    };
  }

  const createPayload = buildCreateContactPayload(supplier);
  const operationKey = buildOperationKey({
    organizationId: params.organizationId,
    tenantId: connection.tenant_id!,
    supplierId: params.supplierId,
    payload: createPayload,
  });
  const idempotencyKey = buildIdempotencyKey(operationKey);
  const admin = await getAdmin();

  const existingOperationResult = await admin
    .from("organization_external_contact_operations" as never)
    .select("*")
    .eq("operation_key", operationKey)
    .maybeSingle();

  if (existingOperationResult.error) {
    throw new Error(existingOperationResult.error.message);
  }

  const existingOperation = (existingOperationResult.data ?? null) as Record<string, unknown> | null;
  if (existingOperation?.status === "succeeded" && typeof existingOperation.external_contact_id === "string") {
    const linked = await linkSupplierToImportedXeroContact({
      organizationId: params.organizationId,
      supplierId: params.supplierId,
      contactId: existingOperation.external_contact_id,
      actorUserId: params.actorUserId,
      matchMethod: "manual_create",
    });

    return {
      ok: true as const,
      linkId: linked.id,
      contactId: linked.external_contact_id,
    };
  }

  if (!existingOperation) {
    const insertOperation = await admin
      .from("organization_external_contact_operations" as never)
      .insert({
        organization_id: params.organizationId,
        accounting_connection_id: connection.id,
        provider: "xero",
        local_entity_type: "supplier",
        local_entity_id: params.supplierId,
        tenant_id: connection.tenant_id,
        operation_type: "create_contact",
        operation_key: operationKey,
        status: "pending",
        created_by: params.actorUserId,
        request_summary: {
          supplierName: getSupplierName(supplier),
          email: supplier.email ?? null,
          phone: supplier.phone ?? null,
        },
      } as never);

    if (insertOperation.error) {
      throw new Error(insertOperation.error.message);
    }
  }

  const { tokenSet } = await getFreshXeroAccessToken(params.organizationId);

  try {
    const createdContacts = await createXeroContacts({
      accessToken: tokenSet.access_token,
      tenantId: connection.tenant_id!,
      contacts: [createPayload],
      summarizeErrors: true,
      idempotencyKey,
    });

    const normalized = normalizeXeroContact(createdContacts[0] ?? null);
    const firstContact = createdContacts[0] ?? null;
    const validationMessage =
      Array.isArray(firstContact?.ValidationErrors)
        ? firstContact.ValidationErrors.map((entry) => firstPresentString(entry.message, entry.Message)).filter(Boolean).join("; ")
        : Array.isArray(firstContact?.validationErrors)
          ? firstContact.validationErrors.map((entry) => firstPresentString(entry.message, entry.Message)).filter(Boolean).join("; ")
          : "";

    if (!normalized) {
      await admin
        .from("organization_external_contact_operations" as never)
        .update({
          status: "failed",
          error_code: "xero_validation",
          error_message: validationMessage || "Xero did not return a valid ContactID for the created contact.",
          response_summary: {
            hasValidationErrors: Boolean(firstContact?.HasValidationErrors ?? firstContact?.hasValidationErrors),
          },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("operation_key", operationKey);

      throw new Error(validationMessage || "Xero could not create the contact with the supplied supplier details.");
    }

    await admin
      .from("organization_xero_contacts" as never)
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
      } as never, {
        onConflict: "organization_id,tenant_id,contact_id",
      });

    await admin
      .from("organization_external_contact_operations" as never)
      .update({
        status: "succeeded",
        external_contact_id: normalized.contact_id,
        response_summary: {
          contactId: normalized.contact_id,
          name: normalized.name,
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("operation_key", operationKey);

    const linked = await linkSupplierToImportedXeroContact({
      organizationId: params.organizationId,
      supplierId: params.supplierId,
      contactId: normalized.contact_id,
      actorUserId: params.actorUserId,
      matchMethod: "manual_create",
    });

    await recordSupplierContactActivity({
      organizationId: params.organizationId,
      supplierId: params.supplierId,
      externalContactLinkId: linked.id,
      actorUserId: params.actorUserId,
      action: "xero_contact_created",
      message: `Created Xero contact ${normalized.name} from supplier ${getSupplierName(supplier)}.`,
      metadata: {
        externalContactId: normalized.contact_id,
      },
    });

    return {
      ok: true as const,
      linkId: linked.id,
      contactId: normalized.contact_id,
    };
  } catch (error) {
    const safeMessage = toSafeCreateContactError(error);
    const errorCode =
      error instanceof XeroRequestError && error.status === 401
        ? "xero_connection"
        : error instanceof XeroRequestError && error.status === 403
          ? "xero_permission"
          : error instanceof XeroRequestError && error.status === 429
            ? "xero_rate_limit"
            : error instanceof XeroRequestError && error.status >= 400 && error.status < 500
              ? "xero_validation"
              : "xero_unknown";

    await admin
      .from("organization_external_contact_operations" as never)
      .update({
        status: errorCode === "xero_unknown" ? "uncertain" : "failed",
        error_code: errorCode,
        error_message: safeMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("operation_key", operationKey);

    throw new Error(safeMessage);
  }
}
