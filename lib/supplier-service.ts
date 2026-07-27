import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getSupplierDuplicateWarnings,
  type OrganizationSupplierRow,
  type SupplierDuplicateWarning,
} from "@/lib/suppliers";
import {
  SupplierValidationError,
  validateSupplierWriteInput,
  type SupplierWriteInput,
} from "@/lib/supplier-validation";

type SupplierClient = SupabaseClient<Database>;

export class SupplierDuplicateWarningError extends Error {
  warnings: SupplierDuplicateWarning[];

  constructor(warnings: SupplierDuplicateWarning[]) {
    super("Possible duplicate suppliers found.");
    this.name = "SupplierDuplicateWarningError";
    this.warnings = warnings;
  }
}

async function listSuppliersForDuplicateCheck(
  supabase: SupplierClient,
  organizationId: string,
): Promise<OrganizationSupplierRow[]> {
  const { data, error } = await supabase
    .from("organization_suppliers")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OrganizationSupplierRow[];
}

type SaveSupplierParams = {
  supabase: SupplierClient;
  organizationId: string;
  actorUserId: string;
  supplierId?: string | null;
  source: OrganizationSupplierRow["source"];
  input: SupplierWriteInput;
  confirmPotentialDuplicates?: boolean;
};

type SaveSupplierResult = {
  supplier: OrganizationSupplierRow;
  warnings: SupplierDuplicateWarning[];
};

function buildSupplierPatch(
  validated: ReturnType<typeof validateSupplierWriteInput>,
): Database["public"]["Tables"]["organization_suppliers"]["Update"] {
  return {
    name: validated.name,
    company_name: validated.name,
    legal_name: validated.legalName,
    email: validated.primaryContactEmail,
    phone: validated.primaryContactPhone,
    address: validated.address,
    primary_contact_first_name: validated.primaryContactFirstName,
    primary_contact_last_name: validated.primaryContactLastName,
    primary_contact_email: validated.primaryContactEmail,
    primary_contact_phone: validated.primaryContactPhone,
    website: validated.website,
    address_line_1: validated.addressLine1,
    address_line_2: validated.addressLine2,
    city: validated.city,
    region: validated.region,
    postal_code: validated.postalCode,
    country_code: validated.countryCode,
    company_registration_number: validated.companyRegistrationNumber,
    tax_number: validated.taxNumber,
    tax_number_type: validated.taxNumberType,
    default_currency_code: validated.defaultCurrencyCode,
    default_payment_terms: validated.defaultPaymentTerms,
    payment_terms_type: validated.paymentTermsType,
    payment_terms_day: validated.paymentTermsDay,
    is_active: validated.isActive,
  };
}

function buildSupplierInsert(
  organizationId: string,
  actorUserId: string,
  source: OrganizationSupplierRow["source"],
  validated: ReturnType<typeof validateSupplierWriteInput>,
): Database["public"]["Tables"]["organization_suppliers"]["Insert"] {
  return {
    organization_id: organizationId,
    created_by: actorUserId,
    source,
    name: validated.name,
    company_name: validated.name,
    legal_name: validated.legalName,
    email: validated.primaryContactEmail,
    phone: validated.primaryContactPhone,
    address: validated.address,
    primary_contact_first_name: validated.primaryContactFirstName,
    primary_contact_last_name: validated.primaryContactLastName,
    primary_contact_email: validated.primaryContactEmail,
    primary_contact_phone: validated.primaryContactPhone,
    website: validated.website,
    address_line_1: validated.addressLine1,
    address_line_2: validated.addressLine2,
    city: validated.city,
    region: validated.region,
    postal_code: validated.postalCode,
    country_code: validated.countryCode,
    company_registration_number: validated.companyRegistrationNumber,
    tax_number: validated.taxNumber,
    tax_number_type: validated.taxNumberType,
    default_currency_code: validated.defaultCurrencyCode,
    default_payment_terms: validated.defaultPaymentTerms,
    payment_terms_type: validated.paymentTermsType,
    payment_terms_day: validated.paymentTermsDay,
    is_active: validated.isActive,
  };
}

export async function saveSupplier(params: SaveSupplierParams): Promise<SaveSupplierResult> {
  const validated = validateSupplierWriteInput(params.input);
  const warnings = getSupplierDuplicateWarnings({
    suppliers: await listSuppliersForDuplicateCheck(params.supabase, params.organizationId),
    supplierId: params.supplierId ?? null,
    name: validated.name,
    legalName: validated.legalName,
    email: validated.primaryContactEmail,
    phone: validated.primaryContactPhone,
    companyRegistrationNumber: validated.companyRegistrationNumber,
    taxNumber: validated.taxNumber,
    website: validated.website,
  });

  if (warnings.length > 0 && !params.confirmPotentialDuplicates) {
    throw new SupplierDuplicateWarningError(warnings);
  }

  const patch = buildSupplierPatch(validated);

  if (params.supplierId) {
    const { data, error } = await params.supabase
      .from("organization_suppliers")
      .update(patch)
      .eq("organization_id", params.organizationId)
      .eq("id", params.supplierId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to update supplier.");
    }

    return {
      supplier: data as OrganizationSupplierRow,
      warnings,
    };
  }

  const { data, error } = await params.supabase
    .from("organization_suppliers")
    .insert(buildSupplierInsert(
      params.organizationId,
      params.actorUserId,
      params.source,
      validated,
    ))
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create supplier.");
  }

  return {
    supplier: data as OrganizationSupplierRow,
    warnings,
  };
}

export async function setSupplierActiveState(params: {
  supabase: SupplierClient;
  organizationId: string;
  supplierId: string;
  isActive: boolean;
}) {
  const { data, error } = await params.supabase
    .from("organization_suppliers")
    .update({ is_active: params.isActive })
    .eq("organization_id", params.organizationId)
    .eq("id", params.supplierId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update supplier status.");
  }

  return data as OrganizationSupplierRow;
}

export { SupplierValidationError };
