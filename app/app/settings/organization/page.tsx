import { OrganizationSettingsForm } from "../OrganizationSettingsForm";
import { getSettingsContext } from "../settings-data";

export default async function OrganizationSettingsPage() {
  const { currentMember, organizationRow, initialLogoUrl } = await getSettingsContext();

  if (!currentMember || !organizationRow) {
    return null;
  }

  const organization = organizationRow as any;

  return (
    <OrganizationSettingsForm
      organizationId={organization.id}
      initialName={organization.name}
      initialLogoPath={organization.logo_path}
      initialLogoUrl={initialLogoUrl}
      initialBrandPrimaryColor={organization.brand_primary_color}
      initialBrandAccentColor={organization.brand_accent_color}
      initialBusinessNumber={organization.business_number}
      initialBankAccountDetails={organization.bank_account_details}
      initialGstNumber={organization.gst_number}
      initialAddressLine1={organization.address_line_1}
      initialAddressLine2={organization.address_line_2}
      initialCity={organization.city}
      initialPostcode={organization.postcode}
      initialCountry={organization.country}
      initialContactName={organization.contact_name}
      initialContactEmail={organization.contact_email}
      initialContactPhone={organization.contact_phone}
      initialDefaultCurrency={organization.default_currency}
      initialTimezone={organization.timezone}
      initialDefaultTaxMode={organization.default_tax_mode}
      initialDefaultTaxRate={organization.default_tax_rate}
      canEdit
    />
  );
}
