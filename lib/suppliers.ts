import type { Database } from "@/lib/supabase/types";

export type OrganizationSupplierRow = Database["public"]["Tables"]["organization_suppliers"]["Row"];

export type SupplierDuplicateWarning = {
  id: string;
  message: string;
  severity: "warning" | "caution";
};

export function getSupplierDisplayName(supplier: Pick<OrganizationSupplierRow, "company_name" | "name">) {
  return supplier.company_name?.trim() || supplier.name?.trim() || "";
}

export function normalizeSupplierLookupValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getSupplierDuplicateWarnings(params: {
  suppliers: OrganizationSupplierRow[];
  supplierId?: string | null;
  name: string;
  email?: string | null;
}) {
  const { suppliers, supplierId = null, name, email = null } = params;
  const normalizedName = normalizeSupplierLookupValue(name);
  const normalizedEmail = normalizeSupplierLookupValue(email);

  const warnings: SupplierDuplicateWarning[] = [];
  if (!normalizedName && !normalizedEmail) {
    return warnings;
  }

  for (const supplier of suppliers) {
    if (supplier.id === supplierId) {
      continue;
    }

    const existingName = normalizeSupplierLookupValue(getSupplierDisplayName(supplier));
    const existingEmail = normalizeSupplierLookupValue(supplier.email);

    if (normalizedName && existingName && existingName === normalizedName) {
      warnings.push({
        id: `name-${supplier.id}`,
        message: `A supplier named "${getSupplierDisplayName(supplier)}" already exists.`,
        severity: "warning",
      });
    }

    if (normalizedEmail && existingEmail && existingEmail === normalizedEmail) {
      warnings.push({
        id: `email-${supplier.id}`,
        message: `A supplier using ${supplier.email} already exists.`,
        severity: "caution",
      });
    }
  }

  return warnings;
}
