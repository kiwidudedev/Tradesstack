import { OrganizationSettingsForm } from "../OrganizationSettingsForm";
import { getSettingsContext } from "../settings-data";
import { hasPermission } from "@/lib/permissions-server";
import { canManageOrganizationSettings } from "@/lib/role-permissions";

export default async function OrganizationSettingsPage() {
  const { currentMember, organizationRow, initialLogoUrl } = await getSettingsContext();

  if (!currentMember || !organizationRow) {
    return null;
  }

  const canEdit =
    canManageOrganizationSettings(currentMember.role) &&
    (await hasPermission("settings.organization.update"));

  return (
    <OrganizationSettingsForm
      organizationId={organizationRow.id}
      initialName={organizationRow.name}
      initialLogoPath={organizationRow.logo_path}
      initialLogoUrl={initialLogoUrl}
      initialBrandPrimaryColor={organizationRow.brand_primary_color}
      initialBrandAccentColor={organizationRow.brand_accent_color}
      initialBusinessNumber={organizationRow.business_number}
      initialBankAccountDetails={organizationRow.bank_account_details}
      initialGstNumber={organizationRow.gst_number}
      initialAddressLine1={organizationRow.address_line_1}
      initialAddressLine2={organizationRow.address_line_2}
      initialCity={organizationRow.city}
      initialPostcode={organizationRow.postcode}
      initialCountry={organizationRow.country}
      initialContactName={organizationRow.contact_name}
      initialContactEmail={organizationRow.contact_email}
      initialContactPhone={organizationRow.contact_phone}
      initialDefaultCurrency={organizationRow.default_currency}
      initialTimezone={organizationRow.timezone}
      initialDefaultTaxMode={organizationRow.default_tax_mode}
      initialDefaultTaxRate={organizationRow.default_tax_rate}
      canEdit={canEdit}
    />
  );
}
