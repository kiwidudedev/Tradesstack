begin;

alter table public.organization_suppliers
  add column if not exists primary_contact_first_name text null,
  add column if not exists primary_contact_last_name text null,
  add column if not exists primary_contact_email text null,
  add column if not exists primary_contact_phone text null,
  add column if not exists address_line_1 text null,
  add column if not exists address_line_2 text null,
  add column if not exists city text null,
  add column if not exists region text null,
  add column if not exists postal_code text null,
  add column if not exists country_code text null,
  add column if not exists company_registration_number text null,
  add column if not exists tax_number text null,
  add column if not exists tax_number_type text null,
  add column if not exists default_currency_code text null,
  add column if not exists payment_terms_type text null,
  add column if not exists payment_terms_day integer null;

create index if not exists organization_suppliers_org_primary_contact_email_idx
  on public.organization_suppliers (organization_id, lower(primary_contact_email))
  where primary_contact_email is not null;

create index if not exists organization_suppliers_org_company_registration_idx
  on public.organization_suppliers (organization_id, lower(company_registration_number))
  where company_registration_number is not null;

create index if not exists organization_suppliers_org_tax_number_idx
  on public.organization_suppliers (organization_id, lower(tax_number))
  where tax_number is not null;

commit;
