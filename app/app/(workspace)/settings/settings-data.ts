import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getSettingsContext() {
  const currentMember = await getCurrentOrganizationMember();
  const supabase = await createServerSupabaseClient();

  const members = currentMember
    ? await supabase
        .from("organization_members")
        .select("id, user_id, display_name, role, created_at")
        .eq("organization_id", currentMember.organization_id)
        .order("created_at", { ascending: true })
    : { data: null, error: null };

  const organization = currentMember
    ? await supabase
        .from("organizations")
        .select("id, name, logo_path, brand_primary_color, brand_accent_color, business_number, bank_account_details, gst_number, address_line_1, address_line_2, city, postcode, country, contact_name, contact_email, contact_phone, default_currency, timezone, default_tax_mode, default_tax_rate, tax_registration_status, construction_profile, created_by, created_at, updated_at")
        .eq("id", currentMember.organization_id)
        .maybeSingle()
    : { data: null, error: null };

  const projects = currentMember
    ? await supabase
        .from("organization_projects")
        .select("id, name, slug, created_at")
        .eq("organization_id", currentMember.organization_id)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const memberRows = members.error ? [] : members.data ?? [];
  const organizationRow = organization.error ? null : organization.data ?? null;
  const projectRows = projects.error ? [] : projects.data ?? [];
  const initialLogoUrl = organizationRow?.logo_path
    ? supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path).data.publicUrl
    : null;

  return {
    currentMember,
    memberRows,
    organizationRow,
    projectRows,
    initialLogoUrl,
  };
}
