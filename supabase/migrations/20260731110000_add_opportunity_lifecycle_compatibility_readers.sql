begin;

-- Stage 2 is compatibility-only. These resolvers read the immutable lifecycle
-- evidence introduced in Stage 1; this migration inserts no rollout, lifecycle,
-- promotion, Opportunity, Project, quote, or commercial rows.
create or replace function public.classify_opportunity_lifecycle_v1(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns table (
  classification text,
  is_valid boolean,
  opportunity_id uuid,
  workspace_project_id uuid,
  converted_project_id uuid,
  mapped_project_id uuid,
  mapped_accepted_quote_id uuid,
  lifecycle_strategy text,
  lifecycle_strategy_version smallint,
  reason_code text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  lifecycle_row public.opportunity_lifecycles%rowtype;
  mapping_row public.opportunity_final_projects%rowtype;
  workspace_row public.organization_projects%rowtype;
  final_row public.organization_projects%rowtype;
  event_row public.opportunity_promotion_events%rowtype;
  accepted_quote_row public.project_quotes%rowtype;
  workspace_reference_count integer := 0;
begin
  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = p_opportunity_id;

  if not found then
    return query select
      'invalid_or_ambiguous'::text, false, p_opportunity_id,
      null::uuid, null::uuid, null::uuid, null::uuid,
      null::text, null::smallint, 'opportunity_not_found'::text;
    return;
  end if;

  select *
  into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = p_organization_id
    and lifecycle.opportunity_id = p_opportunity_id;

  select *
  into mapping_row
  from public.opportunity_final_projects mapping
  where mapping.organization_id = p_organization_id
    and mapping.opportunity_id = p_opportunity_id;

  if opportunity_row.workspace_project_id is not null then
    select *
    into workspace_row
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and project.id = opportunity_row.workspace_project_id;

    select count(*)
    into workspace_reference_count
    from public.organization_opportunities other_opportunity
    where other_opportunity.workspace_project_id = opportunity_row.workspace_project_id;

    if workspace_row.id is null then
      return query select
        'invalid_or_ambiguous'::text, false, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'workspace_project_missing'::text;
      return;
    end if;

    if workspace_reference_count <> 1 then
      return query select
        'invalid_or_ambiguous'::text, false, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'workspace_project_shared'::text;
      return;
    end if;
  end if;

  if mapping_row.project_id is not null then
    select *
    into final_row
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and project.id = mapping_row.project_id;

    if final_row.id is null
      or final_row.source_opportunity_id is distinct from opportunity_row.id
      or opportunity_row.converted_project_id is distinct from mapping_row.project_id
    then
      return query select
        'invalid_or_ambiguous'::text, false, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'final_mapping_contradiction'::text;
      return;
    end if;
  elsif opportunity_row.converted_project_id is not null then
    return query select
      'invalid_or_ambiguous'::text, false, opportunity_row.id,
      opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
      null::uuid, null::uuid, lifecycle_row.strategy,
      lifecycle_row.strategy_version, 'converted_project_without_mapping'::text;
    return;
  end if;

  if mapping_row.accepted_quote_id is not null then
    select *
    into accepted_quote_row
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.id = mapping_row.accepted_quote_id;

    if accepted_quote_row.id is null
      or accepted_quote_row.originating_opportunity_id is distinct from opportunity_row.id
      or accepted_quote_row.project_id is distinct from mapping_row.project_id
      or accepted_quote_row.status <> 'Accepted'
      or exists (
        select 1
        from public.project_quote_line_items line
        where line.quote_id = accepted_quote_row.id
          and (
            line.organization_id is distinct from p_organization_id
            or line.project_id is distinct from mapping_row.project_id
          )
      )
    then
      return query select
        'invalid_or_ambiguous'::text, false, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'accepted_quote_mapping_contradiction'::text;
      return;
    end if;
  end if;

  if lifecycle_row.id is null then
    if opportunity_row.workspace_project_id is not null
      and opportunity_row.converted_project_id is not null
      and opportunity_row.workspace_project_id <> opportunity_row.converted_project_id
      and mapping_row.project_id = opportunity_row.converted_project_id
    then
      return query select
        'historical_two_project'::text, true, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        null::text, null::smallint, 'valid_historical_final_mapping'::text;
      return;
    end if;

    if opportunity_row.workspace_project_id is not null
      and opportunity_row.converted_project_id is null
      and mapping_row.project_id is null
    then
      return query select
        'legacy_unmarked'::text, true, opportunity_row.id,
        opportunity_row.workspace_project_id, null::uuid, null::uuid, null::uuid,
        null::text, null::smallint, 'unmarked_unawarded_workspace'::text;
      return;
    end if;

    return query select
      'invalid_or_ambiguous'::text, false, opportunity_row.id,
      opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
      mapping_row.project_id, mapping_row.accepted_quote_id,
      null::text, null::smallint, 'unmarked_unsupported_shape'::text;
    return;
  end if;

  if lifecycle_row.strategy_version <> 1
    or lifecycle_row.original_workspace_project_id
      is distinct from opportunity_row.workspace_project_id
    or workspace_row.source_opportunity_id is distinct from opportunity_row.id
  then
    return query select
      'invalid_or_ambiguous'::text, false, opportunity_row.id,
      opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
      mapping_row.project_id, mapping_row.accepted_quote_id,
      lifecycle_row.strategy, lifecycle_row.strategy_version,
      'lifecycle_workspace_contradiction'::text;
    return;
  end if;

  if lifecycle_row.strategy = 'legacy_two_project_v1' then
    if (
      opportunity_row.converted_project_id is null
      and mapping_row.project_id is null
    ) or (
      opportunity_row.converted_project_id is not null
      and opportunity_row.converted_project_id <> opportunity_row.workspace_project_id
      and mapping_row.project_id = opportunity_row.converted_project_id
    ) then
      return query select
        'future_explicit_legacy'::text, true, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'valid_explicit_legacy_strategy'::text;
      return;
    end if;

    return query select
      'invalid_or_ambiguous'::text, false, opportunity_row.id,
      opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
      mapping_row.project_id, mapping_row.accepted_quote_id,
      lifecycle_row.strategy, lifecycle_row.strategy_version,
      'explicit_legacy_shape_contradiction'::text;
    return;
  end if;

  if lifecycle_row.strategy = 'promote_workspace_v1' then
    if opportunity_row.converted_project_id is null
      and mapping_row.project_id is null
      and not exists (
        select 1
        from public.opportunity_promotion_events promotion_event
        where promotion_event.organization_id = p_organization_id
          and promotion_event.opportunity_id = opportunity_row.id
      )
    then
      return query select
        'future_unawarded_promotion'::text, true, opportunity_row.id,
        opportunity_row.workspace_project_id, null::uuid, null::uuid, null::uuid,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'valid_unawarded_promotion'::text;
      return;
    end if;

    select *
    into event_row
    from public.opportunity_promotion_events promotion_event
    where promotion_event.organization_id = p_organization_id
      and promotion_event.opportunity_id = opportunity_row.id;

    if opportunity_row.workspace_project_id is not null
      and opportunity_row.converted_project_id = opportunity_row.workspace_project_id
      and mapping_row.project_id = opportunity_row.workspace_project_id
      and mapping_row.accepted_quote_id is not null
      and event_row.id is not null
      and event_row.lifecycle_id = lifecycle_row.id
      and event_row.project_id = opportunity_row.workspace_project_id
      and event_row.accepted_quote_id = mapping_row.accepted_quote_id
      and event_row.strategy = lifecycle_row.strategy
      and event_row.strategy_version = lifecycle_row.strategy_version
    then
      return query select
        'future_awarded_promotion'::text, true, opportunity_row.id,
        opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
        mapping_row.project_id, mapping_row.accepted_quote_id,
        lifecycle_row.strategy, lifecycle_row.strategy_version,
        'valid_completed_promotion'::text;
      return;
    end if;

    return query select
      'invalid_or_ambiguous'::text, false, opportunity_row.id,
      opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
      mapping_row.project_id, mapping_row.accepted_quote_id,
      lifecycle_row.strategy, lifecycle_row.strategy_version,
      'promotion_shape_or_event_contradiction'::text;
    return;
  end if;

  return query select
    'invalid_or_ambiguous'::text, false, opportunity_row.id,
    opportunity_row.workspace_project_id, opportunity_row.converted_project_id,
    mapping_row.project_id, mapping_row.accepted_quote_id,
    lifecycle_row.strategy, lifecycle_row.strategy_version,
    'unsupported_lifecycle_strategy'::text;
end;
$$;

create or replace function public.resolve_project_lifecycle_v1(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  classification text,
  is_valid boolean,
  is_visible boolean,
  is_delivery_eligible boolean,
  project_id uuid,
  opportunity_id uuid,
  workspace_project_id uuid,
  mapped_project_id uuid,
  mapped_accepted_quote_id uuid,
  reason_code text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  project_row public.organization_projects%rowtype;
  opportunity_id_value uuid;
  workspace_reference_count integer := 0;
  mapping_reference_count integer := 0;
  lifecycle_context record;
begin
  select *
  into project_row
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.id = p_project_id;

  if not found then
    return query select
      'invalid_or_ambiguous'::text, false, false, false, p_project_id,
      null::uuid, null::uuid, null::uuid, null::uuid,
      'project_not_found'::text;
    return;
  end if;

  select count(*), (array_agg(opportunity.id order by opportunity.id))[1]
  into workspace_reference_count, opportunity_id_value
  from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.workspace_project_id = p_project_id;

  select
    count(*),
    coalesce(
      (array_agg(mapping.opportunity_id order by mapping.opportunity_id))[1],
      opportunity_id_value
    )
  into mapping_reference_count, opportunity_id_value
  from public.opportunity_final_projects mapping
  where mapping.organization_id = p_organization_id
    and mapping.project_id = p_project_id;

  if workspace_reference_count = 0
    and mapping_reference_count = 0
    and project_row.source_opportunity_id is null
  then
    return query select
      'direct_project'::text, true, true, true, project_row.id,
      null::uuid, null::uuid, null::uuid, null::uuid,
      'project_has_no_opportunity_lineage'::text;
    return;
  end if;

  if workspace_reference_count > 1
    or mapping_reference_count > 1
    or opportunity_id_value is null
    or (
      project_row.source_opportunity_id is not null
      and project_row.source_opportunity_id <> opportunity_id_value
    )
  then
    return query select
      'invalid_or_ambiguous'::text, false, false, false, project_row.id,
      opportunity_id_value, null::uuid, null::uuid, null::uuid,
      'project_lineage_ambiguous'::text;
    return;
  end if;

  select *
  into lifecycle_context
  from public.classify_opportunity_lifecycle_v1(
    p_organization_id,
    opportunity_id_value
  );

  if lifecycle_context.is_valid is not true then
    return query select
      'invalid_or_ambiguous'::text, false, false, false, project_row.id,
      opportunity_id_value, lifecycle_context.workspace_project_id,
      lifecycle_context.mapped_project_id,
      lifecycle_context.mapped_accepted_quote_id,
      lifecycle_context.reason_code;
    return;
  end if;

  return query select
    lifecycle_context.classification,
    true,
    (
      project_row.id is distinct from lifecycle_context.workspace_project_id
      or coalesce(project_row.id = lifecycle_context.mapped_project_id, false)
    ),
    (
      coalesce(project_row.id = lifecycle_context.mapped_project_id, false)
      and lifecycle_context.classification in (
        'historical_two_project',
        'future_awarded_promotion',
        'future_explicit_legacy'
      )
    ),
    project_row.id,
    opportunity_id_value,
    lifecycle_context.workspace_project_id,
    lifecycle_context.mapped_project_id,
    lifecycle_context.mapped_accepted_quote_id,
    lifecycle_context.reason_code;
end;
$$;

create or replace function public.get_visible_project_ids_v1(
  p_organization_id uuid,
  p_project_ids uuid[] default null
)
returns table (project_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select project.id
  from public.organization_projects project
  cross join lateral public.resolve_project_lifecycle_v1(
    project.organization_id,
    project.id
  ) lifecycle
  where project.organization_id = p_organization_id
    and (p_project_ids is null or project.id = any(p_project_ids))
    and lifecycle.is_valid
    and lifecycle.is_visible;
$$;

create or replace function public.resolve_project_contractual_baseline_v1(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  quote_id uuid,
  resolution_kind text,
  is_valid boolean,
  reason_code text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  project_context record;
  selected_quote public.project_quotes%rowtype;
begin
  select *
  into project_context
  from public.resolve_project_lifecycle_v1(p_organization_id, p_project_id);

  if project_context.is_valid is not true then
    return query select null::uuid, 'none'::text, false, project_context.reason_code;
    return;
  end if;

  if project_context.classification <> 'direct_project'
    and project_context.is_delivery_eligible is not true
  then
    return query select
      null::uuid, 'none'::text, false, 'project_not_delivery_eligible'::text;
    return;
  end if;

  if project_context.mapped_accepted_quote_id is not null then
    select *
    into selected_quote
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.id = project_context.mapped_accepted_quote_id
      and quote.project_id = p_project_id
      and quote.originating_opportunity_id = project_context.opportunity_id
      and quote.status = 'Accepted'
      and not exists (
        select 1
        from public.project_quote_line_items line
        where line.quote_id = quote.id
          and (
            line.organization_id is distinct from p_organization_id
            or line.project_id is distinct from p_project_id
          )
      );

    if selected_quote.id is null then
      return query select
        null::uuid, 'mapped_accepted_quote'::text, false,
        'mapped_accepted_quote_invalid'::text;
      return;
    end if;

    return query select
      selected_quote.id, 'mapped_accepted_quote'::text, true,
      'authoritative_final_mapping'::text;
    return;
  end if;

  if project_context.classification not in (
    'direct_project',
    'historical_two_project',
    'future_explicit_legacy'
  ) then
    return query select
      null::uuid, 'none'::text, false, 'missing_required_mapped_quote'::text;
    return;
  end if;

  select *
  into selected_quote
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.project_id = p_project_id
  order by
    case
      when quote.status = 'Accepted' then 0
      when quote.status = 'Sent' then 1
      else 2
    end,
    quote.updated_at desc,
    quote.id desc
  limit 1;

  return query select
    selected_quote.id,
    case
      when project_context.classification = 'direct_project'
        then 'direct_project_fallback'
      else 'historical_null_mapping_fallback'
    end,
    true,
    case
      when selected_quote.id is null then 'no_project_quotes'
      else 'existing_precedence_preserved'
    end;
end;
$$;

create or replace function public.is_project_delivery_eligible_v1(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((
    select lifecycle.is_valid and lifecycle.is_delivery_eligible
    from public.resolve_project_lifecycle_v1(
      p_organization_id,
      p_project_id
    ) lifecycle
  ), false);
$$;

-- Existing claim and retention readers already converge on these helpers.
-- Replacing their selection internals makes mapped baselines authoritative
-- without altering claim, retention, PDF, reporting, or Xero presentation code.
create or replace function public.get_project_claim_base_quote_total(
  p_organization_id uuid,
  p_project_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.calculate_project_quote_pre_gst_total(
        quote.subtotal,
        quote.margin_percent,
        quote.discount_amount,
        quote.contingency_amount
      )
      from public.resolve_project_contractual_baseline_v1(
        p_organization_id,
        p_project_id
      ) baseline
      join public.project_quotes quote
        on quote.organization_id = p_organization_id
       and quote.id = baseline.quote_id
      where baseline.is_valid
    ),
    0
  );
$$;

create or replace function public.get_project_claim_base_quote_retention_percent_default(
  p_organization_id uuid,
  p_project_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select round(coalesce(quote.retention_percent_default, 0), 3)
      from public.resolve_project_contractual_baseline_v1(
        p_organization_id,
        p_project_id
      ) baseline
      join public.project_quotes quote
        on quote.organization_id = p_organization_id
       and quote.id = baseline.quote_id
      where baseline.is_valid
    ),
    0
  );
$$;

create or replace function public.enforce_delivery_project_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_organization_id uuid;
  target_project_id uuid;
begin
  target_organization_id := case when tg_op = 'DELETE'
    then old.organization_id else new.organization_id end;
  target_project_id := case when tg_op = 'DELETE'
    then old.project_id else new.project_id end;

  if target_project_id is not null
    and not public.is_project_delivery_eligible_v1(
      target_organization_id,
      target_project_id
    )
  then
    raise exception 'Project is not delivery-eligible'
      using errcode = 'TS409';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- These are the browser-writable delivery roots with direct project_id
-- ownership. Existing module/organization RLS policies remain in force.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_variations',
    'project_purchase_orders',
    'project_claims',
    'project_actual_cost_events',
    'project_time_sheet_entries',
    'project_quality_issues',
    'project_quality_inspections',
    'project_quality_sign_offs',
    'supplier_invoice_lines',
    'project_members',
    'organization_tradesstack_accounting_mappings'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'drop trigger if exists enforce_delivery_project_mutation_v1 on public.%I',
        table_name
      );
      execute format(
        'create trigger enforce_delivery_project_mutation_v1
         before insert or update or delete on public.%I
         for each row execute function public.enforce_delivery_project_mutation_v1()',
        table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_delivery_project_delete_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_project_delivery_eligible_v1(
    old.organization_id,
    old.id
  ) then
    raise exception 'Project is not delivery-eligible for deletion'
      using errcode = 'TS409';
  end if;

  return old;
end;
$$;

drop trigger if exists enforce_delivery_project_delete_v1
on public.organization_projects;
create trigger enforce_delivery_project_delete_v1
before delete on public.organization_projects
for each row execute function public.enforce_delivery_project_delete_v1();

revoke all on function public.classify_opportunity_lifecycle_v1(uuid, uuid)
from public, anon;
revoke all on function public.resolve_project_lifecycle_v1(uuid, uuid)
from public, anon;
revoke all on function public.get_visible_project_ids_v1(uuid, uuid[])
from public, anon;
revoke all on function public.resolve_project_contractual_baseline_v1(uuid, uuid)
from public, anon;
revoke all on function public.is_project_delivery_eligible_v1(uuid, uuid)
from public, anon;
revoke all on function public.enforce_delivery_project_mutation_v1()
from public, anon, authenticated;
revoke all on function public.enforce_delivery_project_delete_v1()
from public, anon, authenticated;

grant execute on function public.classify_opportunity_lifecycle_v1(uuid, uuid)
to authenticated;
grant execute on function public.resolve_project_lifecycle_v1(uuid, uuid)
to authenticated;
grant execute on function public.get_visible_project_ids_v1(uuid, uuid[])
to authenticated;
grant execute on function public.resolve_project_contractual_baseline_v1(uuid, uuid)
to authenticated;
grant execute on function public.is_project_delivery_eligible_v1(uuid, uuid)
to authenticated;

comment on function public.classify_opportunity_lifecycle_v1(uuid, uuid) is
  'Stage 2 read-only Opportunity lifecycle truth table. Explicit lifecycle evidence is required for same-Project promotion.';
comment on function public.resolve_project_lifecycle_v1(uuid, uuid) is
  'Stage 2 mapping-aware Project visibility and delivery-eligibility resolver.';
comment on function public.resolve_project_contractual_baseline_v1(uuid, uuid) is
  'Stage 2 authoritative contractual quote resolver with historical and direct-Project fallback compatibility.';

commit;
