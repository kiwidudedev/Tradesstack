import { describe, expect, it } from "vitest";
import {
  saveSupplier,
  setSupplierActiveState,
  SupplierDuplicateWarningError,
} from "@/lib/supplier-service";
import type { OrganizationSupplierRow } from "@/lib/suppliers";

function createSupplierRow(
  overrides: Partial<OrganizationSupplierRow> = {},
): OrganizationSupplierRow {
  return {
    id: overrides.id ?? "supplier-1",
    organization_id: overrides.organization_id ?? "org-1",
    created_by: overrides.created_by ?? "user-1",
    name: overrides.name ?? "Bunnings",
    company_name: overrides.company_name ?? overrides.name ?? "Bunnings",
    legal_name: overrides.legal_name ?? null,
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    address: overrides.address ?? null,
    address_line_1: overrides.address_line_1 ?? null,
    address_line_2: overrides.address_line_2 ?? null,
    city: overrides.city ?? null,
    region: overrides.region ?? null,
    postal_code: overrides.postal_code ?? null,
    country_code: overrides.country_code ?? null,
    primary_contact_first_name: overrides.primary_contact_first_name ?? null,
    primary_contact_last_name: overrides.primary_contact_last_name ?? null,
    primary_contact_email: overrides.primary_contact_email ?? null,
    primary_contact_phone: overrides.primary_contact_phone ?? null,
    website: overrides.website ?? null,
    company_registration_number: overrides.company_registration_number ?? null,
    tax_number: overrides.tax_number ?? null,
    tax_number_type: overrides.tax_number_type ?? null,
    default_currency_code: overrides.default_currency_code ?? null,
    default_payment_terms: overrides.default_payment_terms ?? "",
    payment_terms_type: overrides.payment_terms_type ?? null,
    payment_terms_day: overrides.payment_terms_day ?? null,
    default_tax_rate_id: overrides.default_tax_rate_id ?? null,
    is_active: overrides.is_active ?? true,
    source: overrides.source ?? "manual",
    created_at: overrides.created_at ?? "2026-07-16T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-07-16T00:00:00.000Z",
  };
}

function createSupabaseStub(seed: OrganizationSupplierRow[]) {
  const suppliers = [...seed];

  return {
    suppliers,
    client: {
      from(table: string) {
        if (table !== "organization_suppliers") {
          throw new Error(`Unexpected table ${table}`);
        }

        const filters: Array<{ column: string; value: unknown }> = [];
        let insertPayload: Record<string, unknown> | null = null;
        let updatePayload: Record<string, unknown> | null = null;

        const query = {
          select() {
            return query;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value });
            return query;
          },
          insert(payload: Record<string, unknown>) {
            insertPayload = payload;
            return query;
          },
          update(payload: Record<string, unknown>) {
            updatePayload = payload;
            return query;
          },
          async single() {
            if (insertPayload) {
              const row = createSupplierRow({
                ...(insertPayload as Partial<OrganizationSupplierRow>),
                id: `supplier-${suppliers.length + 1}`,
              });
              suppliers.push(row);
              return { data: row, error: null };
            }

            if (updatePayload) {
              const row = suppliers.find((supplier) =>
                filters.every((filter) => supplier[filter.column as keyof OrganizationSupplierRow] === filter.value),
              );
              if (!row) {
                return { data: null, error: { message: "Not found" } };
              }
              Object.assign(row, updatePayload, { updated_at: "2026-07-16T01:00:00.000Z" });
              return { data: row, error: null };
            }

            const rows = suppliers.filter((supplier) =>
              filters.every((filter) => supplier[filter.column as keyof OrganizationSupplierRow] === filter.value),
            );
            return { data: rows, error: null };
          },
          then(onFulfilled: (value: { data: OrganizationSupplierRow[]; error: null }) => unknown) {
            const rows = suppliers.filter((supplier) =>
              filters.every((filter) => supplier[filter.column as keyof OrganizationSupplierRow] === filter.value),
            );
            return Promise.resolve(onFulfilled({ data: rows, error: null }));
          },
        };

        return query;
      },
    } as never,
  };
}

describe("supplier service", () => {
  it("creates suppliers with structured data and mirrors primary contact fields into legacy contact fields", async () => {
    const stub = createSupabaseStub([]);

    const result = await saveSupplier({
      supabase: stub.client,
      organizationId: "org-1",
      actorUserId: "user-1",
      source: "manual",
      input: {
        name: "Sample Supplier",
        legalName: "Sample Supplier Ltd",
        primaryContactFirstName: "Admin",
        primaryContactLastName: "Team",
        primaryContactEmail: "supplier@example.test",
        primaryContactPhone: "0800 100 590",
        addressLine1: "11c Airbourne Road",
        city: "Auckland",
        countryCode: "NZ",
        defaultCurrencyCode: "NZD",
        paymentTermsType: "of_following_month",
        paymentTermsDay: 20,
      },
    });

    expect(result.supplier).toMatchObject({
      name: "Sample Supplier",
      company_name: "Sample Supplier",
      legal_name: "Sample Supplier Ltd",
      primary_contact_email: "supplier@example.test",
      email: "supplier@example.test",
      primary_contact_phone: "0800 100 590",
      phone: "0800 100 590",
      address_line_1: "11c Airbourne Road",
      city: "Auckland",
      country_code: "NZ",
      default_currency_code: "NZD",
      payment_terms_type: "of_following_month",
      payment_terms_day: 20,
    });
  });

  it("returns deterministic duplicate warnings without auto-merging", async () => {
    const stub = createSupabaseStub([
      createSupplierRow({
        id: "supplier-existing",
        name: "Sample Supplier",
        email: "supplier@example.test",
        phone: "0800 100 590",
        primary_contact_email: "supplier@example.test",
        primary_contact_phone: "0800 100 590",
      }),
    ]);

    await expect(
      saveSupplier({
        supabase: stub.client,
        organizationId: "org-1",
        actorUserId: "user-1",
        source: "manual",
        input: {
          name: "Sample Supplier",
          primaryContactEmail: "supplier@example.test",
          primaryContactPhone: "0800 100 590",
        },
      }),
    ).rejects.toBeInstanceOf(SupplierDuplicateWarningError);
  });

  it("preserves legacy address and free-text payment terms when editing suppliers without structured replacements", async () => {
    const stub = createSupabaseStub([
      createSupplierRow({
        id: "supplier-legacy",
        name: "Legacy Supplier",
        address: "Level 2\n123 Example Street",
        default_payment_terms: "20th of following month",
      }),
    ]);

    const result = await saveSupplier({
      supabase: stub.client,
      organizationId: "org-1",
      actorUserId: "user-1",
      supplierId: "supplier-legacy",
      source: "manual",
      input: {
        name: "Legacy Supplier",
        address: "Level 2\n123 Example Street",
        defaultPaymentTerms: "20th of following month",
      },
    });

    expect(result.supplier.address).toBe("Level 2\n123 Example Street");
    expect(result.supplier.default_payment_terms).toBe("20th of following month");
  });

  it("updates supplier active state inside the organization scope", async () => {
    const stub = createSupabaseStub([
      createSupplierRow({
        id: "supplier-active",
        is_active: true,
      }),
    ]);

    const result = await setSupplierActiveState({
      supabase: stub.client,
      organizationId: "org-1",
      supplierId: "supplier-active",
      isActive: false,
    });

    expect(result.is_active).toBe(false);
  });
});
