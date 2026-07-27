import { describe, expect, it, vi } from "vitest";
import { buildCreateContactPayload, buildSupplierXeroSuggestions, normalizeXeroContact } from "@/lib/xero/contacts";

vi.mock("server-only", () => ({}));

describe("xero contacts helpers", () => {
  it("normalizes PascalCase contacts using ContactID as the stable identity", () => {
    expect(
      normalizeXeroContact({
        ContactID: "contact-1",
        Name: "PlaceMakers Limited",
        FirstName: "Place",
        LastName: "Makers",
        EmailAddress: "accounts@placemakers.test",
        ContactStatus: "ACTIVE",
        AccountNumber: "SUP-100",
        TaxNumber: "GST-1",
        IsSupplier: true,
        IsCustomer: false,
        UpdatedDateUTC: "2026-07-15T10:00:00.000Z",
        Phones: [
          {
            PhoneType: "DEFAULT",
            PhoneNumber: "09 555 1212",
          },
          {
            PhoneType: "MOBILE",
            PhoneNumber: "021 777 111",
          },
        ],
      }),
    ).toMatchObject({
      contact_id: "contact-1",
      name: "PlaceMakers Limited",
      first_name: "Place",
      last_name: "Makers",
      email: "accounts@placemakers.test",
      phone: "09 555 1212",
      mobile: "021 777 111",
      account_number: "SUP-100",
      tax_number: "GST-1",
      contact_status: "ACTIVE",
      is_supplier: true,
      is_customer: false,
      external_updated_at: "2026-07-15T10:00:00.000Z",
    });
  });

  it("builds deterministic suggestions without fuzzy-name auto linking", () => {
    const suggestions = buildSupplierXeroSuggestions({
      supplier: {
        id: "supplier-1",
        organization_id: "org-1",
        name: "PlaceMakers",
        company_name: "PlaceMakers",
        legal_name: "PlaceMakers Limited",
        primary_contact_first_name: null,
        primary_contact_last_name: null,
        primary_contact_email: null,
        primary_contact_phone: null,
        email: "accounts@placemakers.test",
        phone: "09 555 1212",
        address: null,
        address_line_1: null,
        address_line_2: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        company_registration_number: null,
        tax_number: null,
        tax_number_type: null,
        default_currency_code: null,
        payment_terms_type: null,
        payment_terms_day: null,
        default_payment_terms: "",
        is_active: true,
      },
      contacts: [
        {
          id: "row-1",
          organization_id: "org-1",
          connection_id: "conn-1",
          tenant_id: "tenant-1",
          contact_id: "contact-1",
          name: "PlaceMakers Limited",
          first_name: null,
          last_name: null,
          email: "accounts@placemakers.test",
          phone: "09 555 1212",
          mobile: null,
          account_number: null,
          tax_number: null,
          contact_status: "ACTIVE",
          is_supplier: true,
          is_customer: false,
          external_updated_at: null,
          imported_at: "2026-07-15T10:00:00.000Z",
          addresses_json: [],
          phones_json: [],
          raw_metadata: {},
          created_at: "2026-07-15T10:00:00.000Z",
          updated_at: "2026-07-15T10:00:00.000Z",
        },
        {
          id: "row-2",
          organization_id: "org-1",
          connection_id: "conn-1",
          tenant_id: "tenant-1",
          contact_id: "contact-2",
          name: "PlaceMkrz",
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          mobile: null,
          account_number: null,
          tax_number: null,
          contact_status: "ACTIVE",
          is_supplier: false,
          is_customer: false,
          external_updated_at: null,
          imported_at: "2026-07-15T10:00:00.000Z",
          addresses_json: [],
          phones_json: [],
          raw_metadata: {},
          created_at: "2026-07-15T10:00:00.000Z",
          updated_at: "2026-07-15T10:00:00.000Z",
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      contactId: "contact-1",
      matchLabel: "strong",
      reasons: ["Exact legal name", "Exact email", "Exact phone"],
    });
  });

  it("maps only clean supplier fields into an explicit create-contact payload", () => {
    expect(
      buildCreateContactPayload({
        id: "supplier-1",
        organization_id: "org-1",
        name: "PlaceMakers",
        company_name: "PlaceMakers",
        legal_name: "PlaceMakers Limited",
        primary_contact_first_name: "Site",
        primary_contact_last_name: "Office",
        primary_contact_email: "accounts@placemakers.test",
        primary_contact_phone: "09 555 1212",
        email: "legacy@placemakers.test",
        phone: "09 444 1212",
        address: "Level 2, 123 Example Street",
        address_line_1: "1 Trade Way",
        address_line_2: "East Tamaki",
        city: "Auckland",
        region: "Auckland",
        postal_code: "2013",
        country_code: "NZ",
        company_registration_number: "NZBN-123",
        tax_number: "GST-1",
        tax_number_type: "GST",
        default_currency_code: "NZD",
        payment_terms_type: "of_following_month",
        payment_terms_day: 20,
        default_payment_terms: "20th of following month",
        is_active: true,
      }),
    ).toMatchObject({
      Name: "PlaceMakers Limited",
      EmailAddress: "accounts@placemakers.test",
      FirstName: "Site",
      LastName: "Office",
      Phones: [{ PhoneType: "DEFAULT", PhoneNumber: "09 555 1212" }],
      ContactPersons: [
        {
          FirstName: "Site",
          LastName: "Office",
          EmailAddress: "accounts@placemakers.test",
          IncludeInEmails: true,
        },
      ],
      CompanyNumber: "NZBN-123",
      TaxNumber: "GST-1",
      TaxNumberType: "GST",
      DefaultCurrency: "NZD",
      Addresses: [
        {
          AddressType: "STREET",
          AddressLine1: "1 Trade Way",
          AddressLine2: "East Tamaki",
          City: "Auckland",
          Region: "Auckland",
          PostalCode: "2013",
          Country: "NZ",
        },
      ],
      PaymentTerms: {
        Bills: {
          Type: "OFFOLLOWINGMONTH",
          Day: 20,
        },
      },
    });
  });

  it("does not inject supplier-level accounting defaults into the Xero contact payload", () => {
    const payload = buildCreateContactPayload({
      id: "supplier-1",
      organization_id: "org-1",
      name: "Sample Supplier",
      company_name: "Sample Supplier",
      legal_name: null,
      primary_contact_first_name: null,
      primary_contact_last_name: null,
      primary_contact_email: "supplier@example.test",
      primary_contact_phone: "0800 100 590",
      email: null,
      phone: null,
      address: null,
      address_line_1: null,
      address_line_2: null,
      city: null,
      region: null,
      postal_code: null,
      country_code: null,
      company_registration_number: null,
      tax_number: null,
      tax_number_type: null,
      default_currency_code: null,
      payment_terms_type: null,
      payment_terms_day: null,
      default_payment_terms: "",
      is_active: true,
    });

    expect(payload).not.toHaveProperty("PurchasesDefaultAccountCode");
    expect(payload).not.toHaveProperty("AccountsPayableTaxType");
    expect(payload).not.toHaveProperty("BankAccountDetails");
    expect(payload).not.toHaveProperty("ContactNumber");
    expect(payload).not.toHaveProperty("AccountNumber");
  });
});
