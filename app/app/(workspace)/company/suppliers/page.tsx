import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { getSupplierXeroOverview } from "@/lib/xero/contacts";
import { CompanySuppliersWorkspace } from "./CompanySuppliersWorkspace";

export default async function CompanySuppliersPage() {
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const canEdit = await hasOrganizationPermission(
    currentMember.organization_id,
    "suppliers.write"
  );
  const canManageXeroContacts = await hasOrganizationPermission(
    currentMember.organization_id,
    "accounting.contacts.manage"
  );

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_suppliers")
    .select("*")
    .eq("organization_id", currentMember.organization_id)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const suppliers = (data ?? []) as OrganizationSupplierRow[];
  const xeroOverview = await getSupplierXeroOverview({
    organizationId: currentMember.organization_id,
    suppliers,
  });

  return (
    <CompanySuppliersWorkspace
      initialSuppliers={suppliers}
      canEdit={canEdit}
      canManageXeroContacts={canManageXeroContacts}
      initialXeroOverview={xeroOverview}
    />
  );
}
