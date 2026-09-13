begin;

create or replace function public.reconcile_project_pricing_workbooks_v1(
  p_dry_run boolean default true,
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  opportunity_id uuid,
  project_id uuid,
  source_workbook_count integer,
  existing_continuation_count integer,
  missing_continuation_count integer,
  applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  mapping public.opportunity_final_projects%rowtype;
  source_total integer;
  existing_total integer;
  caller_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  original_claims text := current_setting('request.jwt.claims', true);
begin
  if auth.uid() is null and not caller_is_service then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  for mapping in
    select final_mapping.* from public.opportunity_final_projects final_mapping
    where (p_organization_id is null or final_mapping.organization_id = p_organization_id)
      and (
        caller_is_service
        or (
          public.is_member_of_organization(final_mapping.organization_id)
          and public.has_org_permission(final_mapping.organization_id, 'leads.opportunities.write')
          and public.has_org_permission(final_mapping.organization_id, 'quotes.write')
        )
      )
    order by final_mapping.created_at, final_mapping.opportunity_id
  loop
    select count(*)::integer into source_total
    from public.opportunity_pricing_worksheets source
    where source.organization_id = mapping.organization_id
      and source.opportunity_id = mapping.opportunity_id
      and source.project_id is null and source.quote_id is null and source.variation_id is null
      and source.clone_kind is null and source.archived_at is null;

    select count(*)::integer into existing_total
    from public.opportunity_pricing_worksheets source
    where source.organization_id = mapping.organization_id
      and source.opportunity_id = mapping.opportunity_id
      and source.project_id is null and source.quote_id is null and source.variation_id is null
      and source.clone_kind is null and source.archived_at is null
      and exists (
        select 1 from public.opportunity_pricing_worksheets continuation
        where continuation.organization_id = mapping.organization_id
          and continuation.project_id = mapping.project_id
          and continuation.source_workbook_id = source.id
          and continuation.clone_kind in ('project_working', 'project_workspace')
          and continuation.archived_at is null
      );

    if not p_dry_run and source_total > existing_total then
      if caller_is_service then
        perform set_config(
          'request.jwt.claims',
          jsonb_build_object('sub', mapping.created_by::text, 'role', 'authenticated')::text,
          true
        );
      end if;

      perform * from public.finalize_opportunity_award_pricing_v1(
        mapping.organization_id, mapping.opportunity_id,
        mapping.project_id, mapping.accepted_quote_id
      );

      if caller_is_service then
        perform set_config('request.jwt.claims', coalesce(original_claims, '{}'), true);
      end if;
    end if;

    organization_id := mapping.organization_id;
    opportunity_id := mapping.opportunity_id;
    project_id := mapping.project_id;
    source_workbook_count := source_total;
    existing_continuation_count := existing_total;
    missing_continuation_count := greatest(source_total - existing_total, 0);
    applied := not p_dry_run and source_total > existing_total;
    return next;
  end loop;

  if caller_is_service then
    perform set_config('request.jwt.claims', coalesce(original_claims, '{}'), true);
  end if;
exception when others then
  if caller_is_service then
    perform set_config('request.jwt.claims', coalesce(original_claims, '{}'), true);
  end if;
  raise;
end;
$$;

revoke all on function public.reconcile_project_pricing_workbooks_v1(boolean, uuid)
  from public, anon;
grant execute on function public.reconcile_project_pricing_workbooks_v1(boolean, uuid)
  to authenticated, service_role;

commit;
