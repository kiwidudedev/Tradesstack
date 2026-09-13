begin;

-- Stage 4 is observational only. No rollout rows are inserted, no historical
-- data is backfilled, and the actual promotion event table is not used.
create table public.opportunity_promotion_shadow_controls (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  shadow_enabled boolean not null default false,
  comparison_enabled boolean not null default false,
  evaluator_version text not null default 'shadow-v1',
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_promotion_shadow_evaluator_check
    check (evaluator_version = 'shadow-v1')
);

alter table public.opportunity_promotion_shadow_controls enable row level security;
alter table public.opportunity_promotion_shadow_controls force row level security;
revoke all on public.opportunity_promotion_shadow_controls
from public, anon, authenticated;
grant select, insert, update, delete
on public.opportunity_promotion_shadow_controls to service_role;

create table public.opportunity_promotion_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  workspace_project_id uuid null,
  accepted_quote_id uuid not null,
  final_project_id uuid null,
  lifecycle_strategy text not null,
  lifecycle_strategy_version smallint not null,
  evaluator_version text not null,
  conversion_correlation_id uuid not null,
  observation_kind text not null default 'prospective',
  status text not null default 'pre_observed',
  eligibility_result text not null,
  eligibility_failure_codes text[] not null default '{}',
  predicted_final_project_identity_rule text not null
    default 'workspace_project_id',
  pre_snapshot jsonb not null,
  post_snapshot jsonb null,
  comparison_result text null,
  mismatch_codes text[] not null default '{}',
  immutable_payload_hash text not null,
  pre_observed_at timestamptz not null default timezone('utc', now()),
  compared_at timestamptz null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_promotion_shadow_opportunity_fk
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_shadow_workspace_fk
    foreign key (organization_id, workspace_project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_shadow_quote_fk
    foreign key (organization_id, accepted_quote_id)
    references public.project_quotes (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_shadow_final_project_fk
    foreign key (organization_id, final_project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_shadow_strategy_check
    check (lifecycle_strategy = 'legacy_two_project_v1'),
  constraint opportunity_promotion_shadow_strategy_version_check
    check (lifecycle_strategy_version = 1),
  constraint opportunity_promotion_shadow_evaluator_version_check
    check (evaluator_version = 'shadow-v1'),
  constraint opportunity_promotion_shadow_kind_check
    check (observation_kind = 'prospective'),
  constraint opportunity_promotion_shadow_status_check
    check (status in ('pre_observed', 'completed', 'comparison_error')),
  constraint opportunity_promotion_shadow_eligibility_check
    check (eligibility_result in ('eligible', 'ineligible')),
  constraint opportunity_promotion_shadow_failure_codes_check check (
    eligibility_failure_codes <@ array[
      'opportunity_not_found',
      'lifecycle_missing',
      'strategy_not_legacy',
      'workspace_missing',
      'workspace_lineage_invalid',
      'workspace_shared',
      'existing_conversion_state',
      'accepted_quote_missing',
      'accepted_quote_not_accepted',
      'accepted_quote_superseded',
      'multiple_accepted_quotes',
      'quote_ownership_invalid',
      'quote_line_ownership_invalid',
      'commercial_ownership_invalid',
      'cost_ownership_invalid',
      'currency_or_tax_invalid',
      'document_workspace_missing',
      'document_workspace_ambiguous',
      'orphan_final_candidate'
    ]::text[]
  ),
  constraint opportunity_promotion_shadow_identity_rule_check
    check (predicted_final_project_identity_rule = 'workspace_project_id'),
  constraint opportunity_promotion_shadow_pre_snapshot_check
    check (jsonb_typeof(pre_snapshot) = 'object'),
  constraint opportunity_promotion_shadow_post_snapshot_check
    check (post_snapshot is null or jsonb_typeof(post_snapshot) = 'object'),
  constraint opportunity_promotion_shadow_comparison_result_check
    check (
      comparison_result is null
      or comparison_result in (
        'match', 'expected_difference', 'ineligible', 'mismatch',
        'comparison_error'
      )
    ),
  constraint opportunity_promotion_shadow_mismatch_codes_check check (
    mismatch_codes <@ array[
      'identity_mismatch',
      'baseline_quote_mismatch',
      'baseline_total_mismatch',
      'quote_line_count_mismatch',
      'commercial_item_mismatch',
      'cost_item_mismatch',
      'document_workspace_mismatch',
      'document_count_mismatch',
      'drawing_count_mismatch',
      'takeoff_count_mismatch',
      'scope_count_mismatch',
      'trade_pack_count_mismatch',
      'task_count_mismatch',
      'visibility_mismatch',
      'delivery_eligibility_mismatch',
      'lineage_mismatch',
      'ambiguous_source_state',
      'comparison_failed'
    ]::text[]
  ),
  constraint opportunity_promotion_shadow_hash_check
    check (immutable_payload_hash ~ '^[a-f0-9]{64}$'),
  constraint opportunity_promotion_shadow_completion_shape_check check (
    (
      status = 'pre_observed'
      and final_project_id is null
      and post_snapshot is null
      and comparison_result is null
      and compared_at is null
    ) or (
      status in ('completed', 'comparison_error')
      and final_project_id is not null
      and post_snapshot is not null
      and comparison_result is not null
      and compared_at is not null
    )
  ),
  constraint opportunity_promotion_shadow_org_opportunity_unique
    unique (organization_id, opportunity_id),
  constraint opportunity_promotion_shadow_org_correlation_unique
    unique (organization_id, conversion_correlation_id)
);

create index opportunity_promotion_shadow_runs_reporting_idx
  on public.opportunity_promotion_shadow_runs (
    organization_id, evaluator_version, status, comparison_result, created_at
  );

alter table public.opportunity_promotion_shadow_runs enable row level security;
alter table public.opportunity_promotion_shadow_runs force row level security;
revoke all on public.opportunity_promotion_shadow_runs
from public, anon, authenticated;
grant select on public.opportunity_promotion_shadow_runs to service_role;

create or replace function public.prevent_opportunity_promotion_shadow_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Opportunity promotion shadow observations cannot be deleted'
    using errcode = 'TS409';
end;
$$;

create trigger prevent_opportunity_promotion_shadow_delete
before delete on public.opportunity_promotion_shadow_runs
for each row execute function public.prevent_opportunity_promotion_shadow_delete();

create or replace function public.validate_opportunity_promotion_shadow_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pre_observed'
    or new.status not in ('completed', 'comparison_error')
    or new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.opportunity_id is distinct from old.opportunity_id
    or new.workspace_project_id is distinct from old.workspace_project_id
    or new.accepted_quote_id is distinct from old.accepted_quote_id
    or new.lifecycle_strategy is distinct from old.lifecycle_strategy
    or new.lifecycle_strategy_version is distinct from old.lifecycle_strategy_version
    or new.evaluator_version is distinct from old.evaluator_version
    or new.conversion_correlation_id is distinct from old.conversion_correlation_id
    or new.observation_kind is distinct from old.observation_kind
    or new.eligibility_result is distinct from old.eligibility_result
    or new.eligibility_failure_codes is distinct from old.eligibility_failure_codes
    or new.predicted_final_project_identity_rule
      is distinct from old.predicted_final_project_identity_rule
    or new.pre_snapshot is distinct from old.pre_snapshot
    or new.immutable_payload_hash is distinct from old.immutable_payload_hash
    or new.pre_observed_at is distinct from old.pre_observed_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Opportunity promotion shadow observations are immutable'
      using errcode = 'TS409';
  end if;
  return new;
end;
$$;

create trigger validate_opportunity_promotion_shadow_update
before update on public.opportunity_promotion_shadow_runs
for each row execute function public.validate_opportunity_promotion_shadow_update();

-- The evaluator is pure: every statement below is a read, and the function is
-- declared STABLE. It returns controlled codes and a content-minimized snapshot.
create or replace function public.evaluate_opportunity_promotion_shadow_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_actor_user_id uuid
)
returns table (
  eligible boolean,
  failure_codes text[],
  workspace_project_id uuid,
  lifecycle_strategy text,
  lifecycle_strategy_version smallint,
  evaluator_version text,
  snapshot jsonb,
  payload_hash text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  quote_row public.project_quotes%rowtype;
  lifecycle_row public.opportunity_lifecycles%rowtype;
  failures text[] := array[]::text[];
  accepted_count integer := 0;
  workspace_reference_count integer := 0;
  orphan_count integer := 0;
  document_workspace_count integer := 0;
  resolved_document_workspace_id uuid;
  currency_value text;
  snapshot_value jsonb;
begin
  if not exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_actor_user_id
  ) then
    raise exception 'Not authorized for shadow evaluation' using errcode = '42501';
  end if;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = p_opportunity_id;
  if not found then
    failures := array_append(failures, 'opportunity_not_found');
  end if;

  select * into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = p_organization_id
    and lifecycle.opportunity_id = p_opportunity_id;
  if lifecycle_row.id is null then
    failures := array_append(failures, 'lifecycle_missing');
  elsif lifecycle_row.strategy <> 'legacy_two_project_v1'
    or lifecycle_row.strategy_version <> 1
  then
    failures := array_append(failures, 'strategy_not_legacy');
  end if;

  if opportunity_row.workspace_project_id is null then
    failures := array_append(failures, 'workspace_missing');
  else
    select * into workspace_row
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and project.id = opportunity_row.workspace_project_id;

    if workspace_row.id is null
      or workspace_row.source_opportunity_id is distinct from p_opportunity_id
      or lifecycle_row.original_workspace_project_id
        is distinct from opportunity_row.workspace_project_id
    then
      failures := array_append(failures, 'workspace_lineage_invalid');
    end if;

    select count(*)::integer into workspace_reference_count
    from public.organization_opportunities other_opportunity
    where other_opportunity.workspace_project_id = opportunity_row.workspace_project_id;
    if workspace_reference_count <> 1 then
      failures := array_append(failures, 'workspace_shared');
    end if;
  end if;

  if opportunity_row.converted_project_id is not null
    or exists (
      select 1 from public.opportunity_final_projects mapping
      where mapping.organization_id = p_organization_id
        and mapping.opportunity_id = p_opportunity_id
    )
  then
    failures := array_append(failures, 'existing_conversion_state');
  end if;

  select * into quote_row
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.id = p_accepted_quote_id
    and quote.originating_opportunity_id = p_opportunity_id;
  if quote_row.id is null then
    failures := array_append(failures, 'accepted_quote_missing');
  else
    if quote_row.status <> 'Accepted' then
      failures := array_append(failures, 'accepted_quote_not_accepted');
    end if;
    if quote_row.project_id is not null
      and quote_row.project_id is distinct from opportunity_row.workspace_project_id
    then
      failures := array_append(failures, 'quote_ownership_invalid');
    end if;
    if exists (
      select 1 from public.project_quotes newer_quote
      where newer_quote.organization_id = p_organization_id
        and newer_quote.originating_opportunity_id = p_opportunity_id
        and newer_quote.status = 'Accepted'
        and (
          newer_quote.updated_at > quote_row.updated_at
          or (newer_quote.updated_at = quote_row.updated_at and newer_quote.id > quote_row.id)
        )
    ) then
      failures := array_append(failures, 'accepted_quote_superseded');
    end if;
  end if;

  select count(*)::integer into accepted_count
  from public.project_quotes accepted_quote
  where accepted_quote.organization_id = p_organization_id
    and accepted_quote.originating_opportunity_id = p_opportunity_id
    and accepted_quote.status = 'Accepted';
  if accepted_count > 1 then
    failures := array_append(failures, 'multiple_accepted_quotes');
  end if;

  if exists (
    select 1 from public.project_quote_line_items line
    where line.organization_id = p_organization_id
      and line.quote_id = p_accepted_quote_id
      and line.project_id is not null
      and line.project_id is distinct from opportunity_row.workspace_project_id
  ) then
    failures := array_append(failures, 'quote_line_ownership_invalid');
  end if;

  if exists (
    select 1 from public.commercial_items item
    where item.organization_id = p_organization_id
      and item.opportunity_id = p_opportunity_id
      and item.project_id is not null
      and item.project_id is distinct from opportunity_row.workspace_project_id
  ) then
    failures := array_append(failures, 'commercial_ownership_invalid');
  end if;

  if exists (
    select 1 from public.cost_items cost
    where cost.organization_id = p_organization_id
      and cost.source_document_kind = 'project_quote'
      and cost.source_document_id = p_accepted_quote_id
      and cost.project_id is distinct from opportunity_row.workspace_project_id
  ) then
    failures := array_append(failures, 'cost_ownership_invalid');
  end if;

  select coalesce(
    nullif(upper(btrim(to_jsonb(organization) ->> 'default_currency')), ''),
    'NZD'
  ) into currency_value
  from public.organizations organization
  where organization.id = p_organization_id;
  if nullif(btrim(currency_value), '') is null
    or quote_row.gst_percent < 0
    or quote_row.gst_amount < 0
  then
    failures := array_append(failures, 'currency_or_tax_invalid');
  end if;

  select count(*)::integer, (array_agg(link.workspace_id order by link.workspace_id))[1]
  into document_workspace_count, resolved_document_workspace_id
  from public.document_workspace_entities link
  where link.organization_id = p_organization_id
    and link.opportunity_id = p_opportunity_id;
  if document_workspace_count = 0 then
    failures := array_append(failures, 'document_workspace_missing');
  elsif document_workspace_count <> 1 then
    failures := array_append(failures, 'document_workspace_ambiguous');
  end if;

  select count(*)::integer into orphan_count
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.source_opportunity_id = p_opportunity_id
    and project.id is distinct from opportunity_row.workspace_project_id;
  if orphan_count > 0 then
    failures := array_append(failures, 'orphan_final_candidate');
  end if;

  snapshot_value := jsonb_build_object(
    'quote', jsonb_build_object(
      'id', p_accepted_quote_id,
      'currency', currency_value,
      'subtotal', coalesce(quote_row.subtotal, 0),
      'tax', coalesce(quote_row.gst_amount, 0),
      'total', coalesce(quote_row.total_quote_price, 0),
      'line_count', (select count(*) from public.project_quote_line_items line
        where line.organization_id = p_organization_id and line.quote_id = p_accepted_quote_id)
    ),
    'commercial', jsonb_build_object(
      'item_count', (select count(*) from public.commercial_items item
        where item.organization_id = p_organization_id and item.opportunity_id = p_opportunity_id),
      'total', (select coalesce(sum(item.total), 0) from public.commercial_items item
        where item.organization_id = p_organization_id and item.opportunity_id = p_opportunity_id)
    ),
    'cost', jsonb_build_object(
      'item_count', (select count(*) from public.cost_items cost
        where cost.organization_id = p_organization_id
          and cost.source_document_kind = 'project_quote'
          and cost.source_document_id = p_accepted_quote_id
          and cost.is_current),
      'total', (select coalesce(sum(cost.line_total), 0) from public.cost_items cost
        where cost.organization_id = p_organization_id
          and cost.source_document_kind = 'project_quote'
          and cost.source_document_id = p_accepted_quote_id
          and cost.is_current)
    ),
    'documents', jsonb_build_object(
      'workspace_id', resolved_document_workspace_id,
      'node_count', (select count(*) from public.document_nodes node
        where node.organization_id = p_organization_id
          and node.workspace_id = resolved_document_workspace_id
          and node.deleted_at is null),
      'version_count', (select count(*) from public.document_versions version
        where version.organization_id = p_organization_id
          and version.workspace_id = resolved_document_workspace_id
          and version.purged_at is null)
    ),
    'features', jsonb_build_object(
      'drawing_set_count', (select count(*) from public.project_drawing_sets drawing
        where drawing.organization_id = p_organization_id
          and drawing.project_id = opportunity_row.workspace_project_id),
      'takeoff_page_count', (select count(*) from public.takeoff_pages page
        where page.organization_id = p_organization_id
          and page.project_id = opportunity_row.workspace_project_id),
      'measurement_count', (select count(*) from public.takeoff_measurements measurement
        where measurement.organization_id = p_organization_id
          and measurement.project_id = opportunity_row.workspace_project_id
          and measurement.archived_at is null),
      'trade_pack_count', (select count(*) from public.trade_packs pack
        where pack.organization_id = p_organization_id
          and pack.project_id = opportunity_row.workspace_project_id),
      'scope_run_count', (select count(*) from public.scope_runs scope
        where scope.organization_id = p_organization_id
          and scope.project_id = opportunity_row.workspace_project_id),
      'task_count', (select count(*) from public.project_job_todos task
        where task.organization_id = p_organization_id
          and task.project_id = opportunity_row.workspace_project_id
          and task.deleted_at is null)
    ),
    'predicted', jsonb_build_object(
      'project_id', opportunity_row.workspace_project_id,
      'visible', true,
      'delivery_eligible', true
    )
  );

  return query select
    cardinality(failures) = 0,
    failures,
    opportunity_row.workspace_project_id,
    coalesce(lifecycle_row.strategy, 'legacy_two_project_v1'),
    coalesce(lifecycle_row.strategy_version, 1::smallint),
    'shadow-v1'::text,
    snapshot_value,
    encode(extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function public.evaluate_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.evaluate_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid)
to service_role;

create or replace function public.capture_opportunity_promotion_shadow_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id uuid,
  p_actor_user_id uuid
)
returns table (run_id uuid, captured boolean, eligible boolean, failure_codes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  control_row public.opportunity_promotion_shadow_controls%rowtype;
  evaluation record;
  existing_row public.opportunity_promotion_shadow_runs%rowtype;
begin
  select * into control_row
  from public.opportunity_promotion_shadow_controls control
  where control.organization_id = p_organization_id;
  if control_row.organization_id is null or not control_row.shadow_enabled then
    return query select null::uuid, false, false, '{}'::text[];
    return;
  end if;

  select * into evaluation
  from public.evaluate_opportunity_promotion_shadow_v1(
    p_organization_id, p_opportunity_id, p_accepted_quote_id, p_actor_user_id
  );

  insert into public.opportunity_promotion_shadow_runs (
    organization_id, opportunity_id, workspace_project_id, accepted_quote_id,
    lifecycle_strategy, lifecycle_strategy_version, evaluator_version,
    conversion_correlation_id, eligibility_result, eligibility_failure_codes,
    pre_snapshot, immutable_payload_hash, created_by
  ) values (
    p_organization_id, p_opportunity_id, evaluation.workspace_project_id,
    p_accepted_quote_id, evaluation.lifecycle_strategy,
    evaluation.lifecycle_strategy_version, evaluation.evaluator_version,
    p_correlation_id, case when evaluation.eligible then 'eligible' else 'ineligible' end,
    evaluation.failure_codes, evaluation.snapshot, evaluation.payload_hash,
    p_actor_user_id
  )
  on conflict (organization_id, opportunity_id) do nothing;

  select * into existing_row
  from public.opportunity_promotion_shadow_runs shadow_run
  where shadow_run.organization_id = p_organization_id
    and shadow_run.opportunity_id = p_opportunity_id;

  return query select
    existing_row.id,
    existing_row.conversion_correlation_id = p_correlation_id,
    existing_row.eligibility_result = 'eligible',
    existing_row.eligibility_failure_codes;
end;
$$;

revoke all on function public.capture_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.capture_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid, uuid)
to service_role;

create or replace function public.finalize_opportunity_promotion_shadow_v1(
  p_organization_id uuid,
  p_run_id uuid,
  p_final_project_id uuid,
  p_actor_user_id uuid
)
returns table (finalized boolean, comparison_result text, mismatch_codes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  control_row public.opportunity_promotion_shadow_controls%rowtype;
  run_row public.opportunity_promotion_shadow_runs%rowtype;
  mapping_row public.opportunity_final_projects%rowtype;
  final_row public.organization_projects%rowtype;
  baseline record;
  final_document_workspace_id uuid;
  post_value jsonb;
  mismatches text[] := array[]::text[];
  result_value text;
  pre_quote jsonb;
  pre_commercial jsonb;
  pre_cost jsonb;
  pre_documents jsonb;
  pre_features jsonb;
  actual_visible boolean := false;
  actual_delivery boolean := false;
begin
  if not exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_actor_user_id
  ) then
    raise exception 'Not authorized for shadow comparison' using errcode = '42501';
  end if;

  select * into control_row
  from public.opportunity_promotion_shadow_controls control
  where control.organization_id = p_organization_id;
  if control_row.organization_id is null or not control_row.comparison_enabled then
    return query select false, null::text, '{}'::text[];
    return;
  end if;

  select * into run_row
  from public.opportunity_promotion_shadow_runs shadow_run
  where shadow_run.organization_id = p_organization_id
    and shadow_run.id = p_run_id
  for update;
  if run_row.id is null then
    return query select false, 'comparison_error'::text,
      array['comparison_failed']::text[];
    return;
  end if;
  if run_row.status <> 'pre_observed' then
    return query select false, run_row.comparison_result, run_row.mismatch_codes;
    return;
  end if;

  select * into mapping_row
  from public.opportunity_final_projects mapping
  where mapping.organization_id = p_organization_id
    and mapping.opportunity_id = run_row.opportunity_id;
  select * into final_row
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.id = p_final_project_id;
  select * into baseline
  from public.resolve_project_contractual_baseline_v1(
    p_organization_id, p_final_project_id
  );
  select link.workspace_id into final_document_workspace_id
  from public.document_workspace_entities link
  where link.organization_id = p_organization_id
    and link.project_id = p_final_project_id;

  select exists (
    select 1 from public.get_visible_project_ids_v1(
      p_organization_id, array[p_final_project_id]::uuid[]
    ) visible where visible.project_id = p_final_project_id
  ) into actual_visible;
  actual_delivery := public.is_project_delivery_eligible_v1(
    p_organization_id, p_final_project_id
  );

  post_value := jsonb_build_object(
    'identity', jsonb_build_object(
      'opportunity_id', run_row.opportunity_id,
      'workspace_project_id', run_row.workspace_project_id,
      'final_project_id', p_final_project_id,
      'final_source_opportunity_id', final_row.source_opportunity_id,
      'mapped_project_id', mapping_row.project_id
    ),
    'quote', jsonb_build_object(
      'id', baseline.quote_id,
      'subtotal', (select coalesce(quote.subtotal, 0) from public.project_quotes quote
        where quote.organization_id = p_organization_id and quote.id = baseline.quote_id),
      'tax', (select coalesce(quote.gst_amount, 0) from public.project_quotes quote
        where quote.organization_id = p_organization_id and quote.id = baseline.quote_id),
      'total', (select coalesce(quote.total_quote_price, 0) from public.project_quotes quote
        where quote.organization_id = p_organization_id and quote.id = baseline.quote_id),
      'line_count', (select count(*) from public.project_quote_line_items line
        where line.organization_id = p_organization_id
          and line.quote_id = baseline.quote_id and line.project_id = p_final_project_id)
    ),
    'commercial', jsonb_build_object(
      'item_count', (select count(*) from public.commercial_items item
        where item.organization_id = p_organization_id
          and item.opportunity_id = run_row.opportunity_id
          and item.project_id = p_final_project_id),
      'total', (select coalesce(sum(item.total), 0) from public.commercial_items item
        where item.organization_id = p_organization_id
          and item.opportunity_id = run_row.opportunity_id
          and item.project_id = p_final_project_id)
    ),
    'cost', jsonb_build_object(
      'item_count', (select count(*) from public.cost_items cost
        where cost.organization_id = p_organization_id
          and cost.source_document_kind = 'project_quote'
          and cost.source_document_id = baseline.quote_id
          and cost.project_id = p_final_project_id and cost.is_current),
      'total', (select coalesce(sum(cost.line_total), 0) from public.cost_items cost
        where cost.organization_id = p_organization_id
          and cost.source_document_kind = 'project_quote'
          and cost.source_document_id = baseline.quote_id
          and cost.project_id = p_final_project_id and cost.is_current)
    ),
    'documents', jsonb_build_object(
      'workspace_id', final_document_workspace_id,
      'node_count', (select count(*) from public.document_nodes node
        where node.organization_id = p_organization_id
          and node.workspace_id = final_document_workspace_id and node.deleted_at is null),
      'version_count', (select count(*) from public.document_versions version
        where version.organization_id = p_organization_id
          and version.workspace_id = final_document_workspace_id and version.purged_at is null)
    ),
    'features', jsonb_build_object(
      'drawing_set_count', (select count(*) from public.project_drawing_sets drawing
        where drawing.organization_id = p_organization_id and drawing.project_id = p_final_project_id),
      'takeoff_page_count', (select count(*) from public.takeoff_pages page
        where page.organization_id = p_organization_id and page.project_id = p_final_project_id),
      'measurement_count', (select count(*) from public.takeoff_measurements measurement
        where measurement.organization_id = p_organization_id
          and measurement.project_id = p_final_project_id and measurement.archived_at is null),
      'trade_pack_count', (select count(*) from public.trade_packs pack
        where pack.organization_id = p_organization_id and pack.project_id = p_final_project_id),
      'scope_run_count', (select count(*) from public.scope_runs scope
        where scope.organization_id = p_organization_id and scope.project_id = p_final_project_id),
      'task_count', (select count(*) from public.project_job_todos task
        where task.organization_id = p_organization_id
          and task.project_id = p_final_project_id and task.deleted_at is null)
    ),
    'actual', jsonb_build_object(
      'visible', actual_visible,
      'delivery_eligible', actual_delivery
    )
  );

  pre_quote := run_row.pre_snapshot -> 'quote';
  pre_commercial := run_row.pre_snapshot -> 'commercial';
  pre_cost := run_row.pre_snapshot -> 'cost';
  pre_documents := run_row.pre_snapshot -> 'documents';
  pre_features := run_row.pre_snapshot -> 'features';

  if run_row.eligibility_result = 'ineligible' then
    result_value := 'ineligible';
  else
    if p_final_project_id = run_row.workspace_project_id
      or mapping_row.project_id is distinct from p_final_project_id
    then mismatches := array_append(mismatches, 'identity_mismatch'); end if;
    if final_row.source_opportunity_id is distinct from run_row.opportunity_id
    then mismatches := array_append(mismatches, 'lineage_mismatch'); end if;
    if baseline.is_valid is not true
      or baseline.quote_id is distinct from run_row.accepted_quote_id
    then mismatches := array_append(mismatches, 'baseline_quote_mismatch'); end if;
    if (post_value #>> '{quote,subtotal}')::numeric
        is distinct from (pre_quote ->> 'subtotal')::numeric
      or (post_value #>> '{quote,tax}')::numeric
        is distinct from (pre_quote ->> 'tax')::numeric
      or (post_value #>> '{quote,total}')::numeric
        is distinct from (pre_quote ->> 'total')::numeric
    then mismatches := array_append(mismatches, 'baseline_total_mismatch'); end if;
    if (post_value #>> '{quote,line_count}')::integer
      is distinct from (pre_quote ->> 'line_count')::integer
    then mismatches := array_append(mismatches, 'quote_line_count_mismatch'); end if;
    if post_value -> 'commercial' is distinct from pre_commercial
    then mismatches := array_append(mismatches, 'commercial_item_mismatch'); end if;
    if post_value -> 'cost' is distinct from pre_cost
    then mismatches := array_append(mismatches, 'cost_item_mismatch'); end if;
    if post_value #>> '{documents,workspace_id}'
      is distinct from pre_documents ->> 'workspace_id'
    then mismatches := array_append(mismatches, 'document_workspace_mismatch'); end if;
    if (post_value #>> '{documents,node_count}')::integer
        is distinct from (pre_documents ->> 'node_count')::integer
      or (post_value #>> '{documents,version_count}')::integer
        is distinct from (pre_documents ->> 'version_count')::integer
    then mismatches := array_append(mismatches, 'document_count_mismatch'); end if;
    if (post_value #>> '{features,drawing_set_count}')::integer
      is distinct from (pre_features ->> 'drawing_set_count')::integer
    then mismatches := array_append(mismatches, 'drawing_count_mismatch'); end if;
    if (post_value #>> '{features,takeoff_page_count}')::integer
        is distinct from (pre_features ->> 'takeoff_page_count')::integer
      or (post_value #>> '{features,measurement_count}')::integer
        is distinct from (pre_features ->> 'measurement_count')::integer
    then mismatches := array_append(mismatches, 'takeoff_count_mismatch'); end if;
    if (post_value #>> '{features,scope_run_count}')::integer
      is distinct from (pre_features ->> 'scope_run_count')::integer
    then mismatches := array_append(mismatches, 'scope_count_mismatch'); end if;
    if (post_value #>> '{features,trade_pack_count}')::integer
      is distinct from (pre_features ->> 'trade_pack_count')::integer
    then mismatches := array_append(mismatches, 'trade_pack_count_mismatch'); end if;
    if (post_value #>> '{features,task_count}')::integer
      is distinct from (pre_features ->> 'task_count')::integer
    then mismatches := array_append(mismatches, 'task_count_mismatch'); end if;
    if not actual_visible
    then mismatches := array_append(mismatches, 'visibility_mismatch'); end if;
    if not actual_delivery
    then mismatches := array_append(mismatches, 'delivery_eligibility_mismatch'); end if;

    result_value := case
      when cardinality(mismatches) > 0 then 'mismatch'
      when p_final_project_id <> run_row.workspace_project_id then 'expected_difference'
      else 'match'
    end;
  end if;

  update public.opportunity_promotion_shadow_runs shadow_run
  set final_project_id = p_final_project_id,
      status = 'completed',
      post_snapshot = post_value,
      comparison_result = result_value,
      mismatch_codes = mismatches,
      compared_at = timezone('utc', now())
  where shadow_run.id = run_row.id;

  return query select true, result_value, mismatches;
exception when others then
  if run_row.id is not null and run_row.status = 'pre_observed'
    and p_final_project_id is not null
  then
    update public.opportunity_promotion_shadow_runs shadow_run
    set final_project_id = p_final_project_id,
        status = 'comparison_error',
        post_snapshot = jsonb_build_object('error_code', sqlstate),
        comparison_result = 'comparison_error',
        mismatch_codes = array['comparison_failed']::text[],
        compared_at = timezone('utc', now())
    where shadow_run.id = run_row.id;
  end if;
  return query select false, 'comparison_error'::text,
    array['comparison_failed']::text[];
end;
$$;

revoke all on function public.finalize_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.finalize_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid)
to service_role;

create or replace function public.get_opportunity_promotion_shadow_summary_v1(
  p_organization_id uuid
)
returns table (
  evaluator_version text,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  total_runs bigint,
  eligible_runs bigint,
  ineligible_runs bigint,
  completed_comparisons bigint,
  exact_matches bigint,
  expected_differences bigint,
  mismatches bigint,
  comparison_errors bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(max(run.evaluator_version), 'shadow-v1'),
    min(run.pre_observed_at),
    max(run.pre_observed_at),
    count(*),
    count(*) filter (where run.eligibility_result = 'eligible'),
    count(*) filter (where run.eligibility_result = 'ineligible'),
    count(*) filter (where run.status = 'completed'),
    count(*) filter (where run.comparison_result = 'match'),
    count(*) filter (where run.comparison_result = 'expected_difference'),
    count(*) filter (where run.comparison_result = 'mismatch'),
    count(*) filter (where run.comparison_result = 'comparison_error')
  from public.opportunity_promotion_shadow_runs run
  where run.organization_id = p_organization_id;
$$;

revoke all on function public.get_opportunity_promotion_shadow_summary_v1(uuid)
from public, anon, authenticated;
grant execute on function public.get_opportunity_promotion_shadow_summary_v1(uuid)
to service_role;

comment on table public.opportunity_promotion_shadow_runs is
  'Stage 4 content-minimized, immutable observations of hypothetical same-Project promotion outcomes. These rows are not promotion events.';
comment on function public.evaluate_opportunity_promotion_shadow_v1(uuid, uuid, uuid, uuid) is
  'Pure Stage 4 legacy Opportunity promotion eligibility evaluator; performs no writes.';

commit;
