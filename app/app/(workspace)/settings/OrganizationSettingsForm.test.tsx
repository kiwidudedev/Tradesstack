import { vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  interMedium: {
    className: "inter-medium",
  },
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationSettingsForm } from "./OrganizationSettingsForm";

describe("OrganizationSettingsForm", () => {
  it("renders the construction profile textarea and helper copy", () => {
    const markup = renderToStaticMarkup(
      <OrganizationSettingsForm
        organizationId="org-123"
        initialName="Metro Commercial Interiors"
        initialLogoPath={null}
        initialLogoUrl={null}
        initialBrandPrimaryColor="#123456"
        initialBrandAccentColor="#654321"
        initialBusinessNumber={null}
        initialBankAccountDetails={null}
        initialGstNumber={null}
        initialAddressLine1={null}
        initialAddressLine2={null}
        initialCity={null}
        initialPostcode={null}
        initialCountry="New Zealand"
        initialContactName={null}
        initialContactEmail={null}
        initialContactPhone={null}
        initialDefaultCurrency="NZD"
        initialTimezone="Pacific/Auckland"
        initialDefaultTaxMode="GST Inclusive"
        initialDefaultTaxRate={15}
        initialConstructionProfile="We mostly work on office fitouts and use Rondo."
        canEdit
      />
    );

    expect(markup).toContain("Construction Profile");
    expect(markup).toContain("Tell TradesStack about your construction business");
    expect(markup).toContain('id="organization-construction-profile"');
    expect(markup).toContain("textarea");
    expect(markup).toContain("We mostly work on office fitouts and use Rondo.");
    expect(markup).toContain("4000");
  });
});
