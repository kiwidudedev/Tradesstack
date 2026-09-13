-- Version the organization tax policy whenever authoritative organization settings change.
create function public.sync_organization_tax_policy_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_country text := upper(coalesce(nullif((to_jsonb(new)->>'country'), ''), 'UNKNOWN'));
  v_rate numeric := coalesce(nullif(to_jsonb(new)->>'default_tax_rate', '')::numeric, 0);
  v_basis text := case when lower(coalesce((to_jsonb(new)->>'default_tax_mode'), '')) like '%incl%' then 'inclusive' else 'exclusive' end;
  v_registration text := case lower(coalesce((to_jsonb(new)->>'tax_registration_status'), '')) when 'registered' then 'registered' when 'unregistered' then 'unregistered' else 'unknown' end;
begin
  if (to_jsonb(new)->>'country') is not distinct from (to_jsonb(old)->>'country')
    and (to_jsonb(new)->>'default_tax_mode') is not distinct from (to_jsonb(old)->>'default_tax_mode')
    and nullif(to_jsonb(new)->>'default_tax_rate', '')::numeric is not distinct from nullif(to_jsonb(old)->>'default_tax_rate', '')::numeric
    and (to_jsonb(new)->>'tax_registration_status') is not distinct from (to_jsonb(old)->>'tax_registration_status') then return new; end if;
  update public.organization_tax_policies set effective_to = v_now
  where organization_id = new.id and effective_to is null;
  insert into public.organization_tax_policies (
    organization_id, jurisdiction_code, tax_name, registration_status,
    comparison_basis, standard_rate, supports_inclusive_exclusive,
    effective_from, policy_source, created_by
  ) values (
    new.id, v_country,
    case when v_country in ('NZ', 'NEW ZEALAND', 'AU', 'AUSTRALIA') then 'GST' else 'Tax' end,
    v_registration, v_basis, v_rate,
    v_country in ('NZ', 'NEW ZEALAND', 'AU', 'AUSTRALIA'),
    v_now, 'organization_settings', auth.uid()
  );
  return new;
end;
$$;
create trigger organizations_sync_tax_policy_version
-- Some fresh-install baselines predate these optional organization settings.
-- Compare their JSON values in the function, as the policy backfill already does.
after update
on public.organizations for each row execute function public.sync_organization_tax_policy_version();
revoke all on function public.sync_organization_tax_policy_version() from public, anon, authenticated;

