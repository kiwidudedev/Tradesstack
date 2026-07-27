alter table public.organizations
add column if not exists construction_profile text null;

drop function if exists public.update_organization_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
);

create or replace function public.update_organization_settings(
  p_organization_id uuid,
  p_name text default null,
  p_logo_path text default null,
  p_brand_primary_color text default null,
  p_brand_accent_color text default null,
  p_business_number text default null,
  p_bank_account_details text default null,
  p_gst_number text default null,
  p_address_line_1 text default null,
  p_address_line_2 text default null,
  p_city text default null,
  p_postcode text default null,
  p_country text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_default_currency text default null,
  p_timezone text default null,
  p_default_tax_mode text default null,
  p_default_tax_rate numeric default null,
  p_construction_profile text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.organizations;
  normalized_name text;
  normalized_construction_profile text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_org_permission(p_organization_id, 'settings.organization.update') then
    raise exception 'Not authorized for this organization';
  end if;

  normalized_name := nullif(trim(coalesce(p_name, '')), '');
  normalized_construction_profile := case
    when p_construction_profile is null then null
    else nullif(trim(p_construction_profile), '')
  end;

  if p_logo_path is not null and p_logo_path <> '' and p_logo_path not like p_organization_id::text || '/%' then
    raise exception 'Logo path must be scoped to organization';
  end if;

  update public.organizations o
  set
    name = coalesce(normalized_name, o.name),
    logo_path = coalesce(p_logo_path, o.logo_path),
    brand_primary_color = coalesce(p_brand_primary_color, o.brand_primary_color),
    brand_accent_color = coalesce(p_brand_accent_color, o.brand_accent_color),
    business_number = coalesce(p_business_number, o.business_number),
    bank_account_details = coalesce(p_bank_account_details, o.bank_account_details),
    gst_number = coalesce(p_gst_number, o.gst_number),
    address_line_1 = coalesce(p_address_line_1, o.address_line_1),
    address_line_2 = coalesce(p_address_line_2, o.address_line_2),
    city = coalesce(p_city, o.city),
    postcode = coalesce(p_postcode, o.postcode),
    country = coalesce(p_country, o.country),
    contact_name = coalesce(p_contact_name, o.contact_name),
    contact_email = coalesce(p_contact_email, o.contact_email),
    contact_phone = coalesce(p_contact_phone, o.contact_phone),
    default_currency = coalesce(p_default_currency, o.default_currency),
    timezone = coalesce(p_timezone, o.timezone),
    default_tax_mode = coalesce(p_default_tax_mode, o.default_tax_mode),
    default_tax_rate = coalesce(p_default_tax_rate, o.default_tax_rate),
    construction_profile = case
      when p_construction_profile is null then o.construction_profile
      else normalized_construction_profile
    end,
    updated_at = now()
  where o.id = p_organization_id
  returning o.* into updated_row;

  if updated_row.id is null then
    raise exception 'Organization not found';
  end if;

  return updated_row;
end;
$$;

grant execute on function public.update_organization_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text
) to authenticated;
