create table if not exists public.organization_memory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  memory_category text not null,
  memory_type text not null,
  memory_key text not null,
  title text not null,
  summary text not null default '',
  memory_value jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  confidence_score numeric not null default 0,
  derived_from_event_count integer not null default 0,
  derived_from_ai_interaction_count integer not null default 0,
  derived_from_correction_count integer not null default 0,
  derived_from_validation_count integer not null default 0,
  derived_from_total_count integer not null default 0,
  reinforcement_count integer not null default 0,
  contradiction_count integer not null default 0,
  is_active boolean not null default true,
  is_user_confirmed boolean not null default false,
  user_confirmed_by_user_id uuid null references auth.users (id) on delete set null,
  user_confirmed_at timestamptz null,
  first_derived_at timestamptz null,
  last_derived_at timestamptz null,
  last_reinforced_at timestamptz null,
  last_contradicted_at timestamptz null,
  privacy_classification text not null default 'commercial_sensitive',
  visibility_scope text not null default 'organization',
  retention_policy_key text null,
  retention_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memory_items_category_not_blank check (char_length(trim(memory_category)) > 0),
  constraint organization_memory_items_type_not_blank check (char_length(trim(memory_type)) > 0),
  constraint organization_memory_items_key_not_blank check (char_length(trim(memory_key)) > 0),
  constraint organization_memory_items_title_not_blank check (char_length(trim(title)) > 0),
  constraint organization_memory_items_summary_not_blank check (summary is not null),
  constraint organization_memory_items_memory_value_object_check check (jsonb_typeof(memory_value) = 'object'),
  constraint organization_memory_items_evidence_summary_object_check check (jsonb_typeof(evidence_summary) = 'object'),
  constraint organization_memory_items_confidence_range_check check (confidence_score >= 0 and confidence_score <= 1),
  constraint organization_memory_items_counts_nonnegative_check check (
    derived_from_event_count >= 0
    and derived_from_ai_interaction_count >= 0
    and derived_from_correction_count >= 0
    and derived_from_validation_count >= 0
    and derived_from_total_count >= 0
    and reinforcement_count >= 0
    and contradiction_count >= 0
  ),
  constraint organization_memory_items_privacy_classification_check check (
    privacy_classification in (
      'public_safe',
      'internal_operational',
      'commercial_sensitive',
      'financial_sensitive',
      'personal_sensitive',
      'restricted'
    )
  ),
  constraint organization_memory_items_visibility_scope_check check (
    visibility_scope in ('organization', 'restricted_role', 'system')
  )
);

create unique index if not exists organization_memory_items_org_category_type_key_uidx
  on public.organization_memory_items (organization_id, memory_category, memory_type, memory_key);

create unique index if not exists organization_memory_items_id_org_uidx
  on public.organization_memory_items (id, organization_id);

create index if not exists organization_memory_items_org_active_confidence_idx
  on public.organization_memory_items (organization_id, is_active, confidence_score desc, updated_at desc);

create index if not exists organization_memory_items_org_category_idx
  on public.organization_memory_items (organization_id, memory_category, memory_type, updated_at desc);

create index if not exists organization_memory_items_org_confirmed_idx
  on public.organization_memory_items (organization_id, is_user_confirmed, updated_at desc);

create table if not exists public.organization_memory_links (
  id uuid primary key default gen_random_uuid(),
  organization_memory_item_id uuid not null,
  organization_id uuid not null,
  link_type text not null default 'supporting',
  source_event_id uuid null references public.intelligence_events (id) on delete cascade,
  source_ai_interaction_id uuid null references public.ai_interactions (id) on delete cascade,
  source_correction_event_id uuid null references public.correction_events (id) on delete cascade,
  source_validation_case_id uuid null references public.validation_cases (id) on delete cascade,
  source_entity_type text null,
  source_entity_id uuid null,
  weight numeric not null default 1,
  confidence_delta numeric null,
  note text null,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_memory_links_memory_item_fkey
    foreign key (organization_memory_item_id, organization_id)
    references public.organization_memory_items (id, organization_id)
    on delete cascade,
  constraint organization_memory_links_link_type_check check (
    link_type in ('seed', 'supporting', 'confirmation', 'contradiction', 'supersession')
  ),
  constraint organization_memory_links_weight_nonnegative_check check (weight >= 0),
  constraint organization_memory_links_confidence_delta_range_check check (
    confidence_delta is null or (confidence_delta >= -1 and confidence_delta <= 1)
  ),
  constraint organization_memory_links_source_presence_check check (
    source_event_id is not null
    or source_ai_interaction_id is not null
    or source_correction_event_id is not null
    or source_validation_case_id is not null
    or source_entity_type is not null
  ),
  constraint organization_memory_links_source_entity_type_not_blank_check check (
    source_entity_type is null or char_length(trim(source_entity_type)) > 0
  )
);

create index if not exists organization_memory_links_item_created_idx
  on public.organization_memory_links (organization_memory_item_id, created_at desc);

create index if not exists organization_memory_links_org_type_created_idx
  on public.organization_memory_links (organization_id, link_type, created_at desc);

create index if not exists organization_memory_links_source_event_idx
  on public.organization_memory_links (source_event_id)
  where source_event_id is not null;

create index if not exists organization_memory_links_source_ai_idx
  on public.organization_memory_links (source_ai_interaction_id)
  where source_ai_interaction_id is not null;

create index if not exists organization_memory_links_source_correction_idx
  on public.organization_memory_links (source_correction_event_id)
  where source_correction_event_id is not null;

create index if not exists organization_memory_links_source_validation_idx
  on public.organization_memory_links (source_validation_case_id)
  where source_validation_case_id is not null;

create unique index if not exists organization_memory_links_item_event_uidx
  on public.organization_memory_links (organization_memory_item_id, source_event_id)
  where source_event_id is not null;

create unique index if not exists organization_memory_links_item_ai_uidx
  on public.organization_memory_links (organization_memory_item_id, source_ai_interaction_id)
  where source_ai_interaction_id is not null;

create unique index if not exists organization_memory_links_item_correction_uidx
  on public.organization_memory_links (organization_memory_item_id, source_correction_event_id)
  where source_correction_event_id is not null;

create unique index if not exists organization_memory_links_item_validation_uidx
  on public.organization_memory_links (organization_memory_item_id, source_validation_case_id)
  where source_validation_case_id is not null;

create trigger set_organization_memory_items_updated_at
before update on public.organization_memory_items
for each row execute function public.set_updated_at();

alter table public.organization_memory_items enable row level security;
alter table public.organization_memory_items force row level security;
alter table public.organization_memory_links enable row level security;
alter table public.organization_memory_links force row level security;

create or replace function public._organization_memory_default_confidence_delta(
  p_link_type text
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_link_type, ''))
    when 'seed' then 0.15
    when 'supporting' then 0.08
    when 'confirmation' then 0.12
    when 'contradiction' then -0.15
    when 'supersession' then -0.20
    else 0
  end
$$;

create or replace function public._organization_memory_assert_platform_admin(
  p_required_role text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.has_platform_admin_role(p_required_role) then
    raise exception 'Platform admin access is required';
  end if;
end;
$$;

create or replace function public._organization_memory_assert_organization_exists(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
  ) then
    raise exception 'Organization does not exist';
  end if;
end;
$$;

create or replace function public._organization_memory_assert_item_in_organization(
  p_memory_item_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_memory_item_id is null then
    raise exception 'organizationMemoryItemId is required';
  end if;

  if not exists (
    select 1
    from public.organization_memory_items omi
    where omi.id = p_memory_item_id
      and omi.organization_id = p_organization_id
  ) then
    raise exception 'Organization memory item does not belong to organization';
  end if;
end;
$$;

create or replace function public._organization_memory_assert_source_in_organization(
  p_organization_id uuid,
  p_source_event_id uuid,
  p_source_ai_interaction_id uuid,
  p_source_correction_event_id uuid,
  p_source_validation_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._intelligence_assert_event_in_organization(p_organization_id, p_source_event_id);
  perform public._intelligence_assert_ai_interaction_in_organization(p_organization_id, p_source_ai_interaction_id);
  perform public._intelligence_assert_validation_case_in_organization(p_organization_id, p_source_validation_case_id);

  if p_source_correction_event_id is not null then
    if not exists (
      select 1
      from public.correction_events ce
      where ce.id = p_source_correction_event_id
        and ce.organization_id = p_organization_id
    ) then
      raise exception 'Linked correction event does not belong to organization';
    end if;
  end if;
end;
$$;

create or replace function public.upsert_organization_memory_item(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
  resolved_id uuid;
  existing_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'upsert_organization_memory_item requires a JSON object payload';
  end if;

  perform public._organization_memory_assert_platform_admin('admin');

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  perform public._organization_memory_assert_organization_exists(resolved_organization_id);

  select omi.id
  into existing_id
  from public.organization_memory_items omi
  where omi.organization_id = resolved_organization_id
    and omi.memory_category = nullif(btrim(coalesce(p_input->>'memoryCategory', '')), '')
    and omi.memory_type = nullif(btrim(coalesce(p_input->>'memoryType', '')), '')
    and omi.memory_key = nullif(btrim(coalesce(p_input->>'memoryKey', '')), '')
  limit 1;

  insert into public.organization_memory_items (
    id,
    organization_id,
    memory_category,
    memory_type,
    memory_key,
    title,
    summary,
    memory_value,
    evidence_summary,
    confidence_score,
    derived_from_event_count,
    derived_from_ai_interaction_count,
    derived_from_correction_count,
    derived_from_validation_count,
    derived_from_total_count,
    reinforcement_count,
    contradiction_count,
    is_active,
    is_user_confirmed,
    user_confirmed_by_user_id,
    user_confirmed_at,
    first_derived_at,
    last_derived_at,
    last_reinforced_at,
    last_contradicted_at,
    privacy_classification,
    visibility_scope,
    retention_policy_key,
    retention_expires_at
  )
  values (
    coalesce(existing_id, gen_random_uuid()),
    resolved_organization_id,
    nullif(btrim(coalesce(p_input->>'memoryCategory', '')), ''),
    nullif(btrim(coalesce(p_input->>'memoryType', '')), ''),
    nullif(btrim(coalesce(p_input->>'memoryKey', '')), ''),
    nullif(btrim(coalesce(p_input->>'title', '')), ''),
    coalesce(p_input->>'summary', ''),
    coalesce(p_input->'memoryValue', '{}'::jsonb),
    coalesce(p_input->'evidenceSummary', '{}'::jsonb),
    coalesce(nullif(p_input->>'confidenceScore', '')::numeric, 0),
    greatest(coalesce(nullif(p_input->>'derivedFromEventCount', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'derivedFromAiInteractionCount', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'derivedFromCorrectionCount', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'derivedFromValidationCount', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'derivedFromTotalCount', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'reinforcementCount', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'contradictionCount', '')::integer, 0), 0),
    coalesce(nullif(p_input->>'isActive', '')::boolean, true),
    coalesce(nullif(p_input->>'isUserConfirmed', '')::boolean, false),
    case
      when coalesce(nullif(p_input->>'isUserConfirmed', '')::boolean, false) then auth.uid()
      else null
    end,
    case
      when coalesce(nullif(p_input->>'isUserConfirmed', '')::boolean, false) then now()
      else null
    end,
    coalesce(nullif(p_input->>'firstDerivedAt', '')::timestamptz, now()),
    coalesce(nullif(p_input->>'lastDerivedAt', '')::timestamptz, now()),
    nullif(p_input->>'lastReinforcedAt', '')::timestamptz,
    nullif(p_input->>'lastContradictedAt', '')::timestamptz,
    coalesce(nullif(btrim(coalesce(p_input->>'privacyClassification', '')), ''), 'commercial_sensitive'),
    coalesce(nullif(btrim(coalesce(p_input->>'visibilityScope', '')), ''), 'organization'),
    nullif(btrim(coalesce(p_input->>'retentionPolicyKey', '')), ''),
    nullif(p_input->>'retentionExpiresAt', '')::timestamptz
  )
  on conflict (organization_id, memory_category, memory_type, memory_key)
  do update set
    title = excluded.title,
    summary = excluded.summary,
    memory_value = excluded.memory_value,
    evidence_summary = excluded.evidence_summary,
    confidence_score = excluded.confidence_score,
    derived_from_event_count = excluded.derived_from_event_count,
    derived_from_ai_interaction_count = excluded.derived_from_ai_interaction_count,
    derived_from_correction_count = excluded.derived_from_correction_count,
    derived_from_validation_count = excluded.derived_from_validation_count,
    derived_from_total_count = excluded.derived_from_total_count,
    reinforcement_count = excluded.reinforcement_count,
    contradiction_count = excluded.contradiction_count,
    is_active = excluded.is_active,
    is_user_confirmed = excluded.is_user_confirmed,
    user_confirmed_by_user_id = excluded.user_confirmed_by_user_id,
    user_confirmed_at = excluded.user_confirmed_at,
    first_derived_at = least(
      coalesce(public.organization_memory_items.first_derived_at, excluded.first_derived_at),
      coalesce(excluded.first_derived_at, public.organization_memory_items.first_derived_at)
    ),
    last_derived_at = greatest(
      coalesce(public.organization_memory_items.last_derived_at, excluded.last_derived_at),
      coalesce(excluded.last_derived_at, public.organization_memory_items.last_derived_at)
    ),
    last_reinforced_at = coalesce(excluded.last_reinforced_at, public.organization_memory_items.last_reinforced_at),
    last_contradicted_at = coalesce(excluded.last_contradicted_at, public.organization_memory_items.last_contradicted_at),
    privacy_classification = excluded.privacy_classification,
    visibility_scope = excluded.visibility_scope,
    retention_policy_key = excluded.retention_policy_key,
    retention_expires_at = excluded.retention_expires_at,
    updated_at = now()
  returning id into resolved_id;

  return resolved_id;
end;
$$;

create or replace function public.link_organization_memory_evidence(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
  resolved_memory_item_id uuid;
  resolved_source_event_id uuid;
  resolved_source_ai_interaction_id uuid;
  resolved_source_correction_event_id uuid;
  resolved_source_validation_case_id uuid;
  resolved_link_type text;
  resolved_confidence_delta numeric;
  existing_link_id uuid;
  inserted_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'link_organization_memory_evidence requires a JSON object payload';
  end if;

  perform public._organization_memory_assert_platform_admin('admin');

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  resolved_memory_item_id := nullif(p_input->>'organizationMemoryItemId', '')::uuid;
  resolved_source_event_id := nullif(p_input->>'sourceEventId', '')::uuid;
  resolved_source_ai_interaction_id := nullif(p_input->>'sourceAiInteractionId', '')::uuid;
  resolved_source_correction_event_id := nullif(p_input->>'sourceCorrectionEventId', '')::uuid;
  resolved_source_validation_case_id := nullif(p_input->>'sourceValidationCaseId', '')::uuid;
  resolved_link_type := coalesce(nullif(btrim(coalesce(p_input->>'linkType', '')), ''), 'supporting');
  resolved_confidence_delta := coalesce(
    nullif(p_input->>'confidenceDelta', '')::numeric,
    public._organization_memory_default_confidence_delta(resolved_link_type)
  );

  perform public._organization_memory_assert_organization_exists(resolved_organization_id);
  perform public._organization_memory_assert_item_in_organization(resolved_memory_item_id, resolved_organization_id);
  perform public._organization_memory_assert_source_in_organization(
    resolved_organization_id,
    resolved_source_event_id,
    resolved_source_ai_interaction_id,
    resolved_source_correction_event_id,
    resolved_source_validation_case_id
  );

  select oml.id
  into existing_link_id
  from public.organization_memory_links oml
  where oml.organization_memory_item_id = resolved_memory_item_id
    and (
      (resolved_source_event_id is not null and oml.source_event_id = resolved_source_event_id)
      or (resolved_source_ai_interaction_id is not null and oml.source_ai_interaction_id = resolved_source_ai_interaction_id)
      or (resolved_source_correction_event_id is not null and oml.source_correction_event_id = resolved_source_correction_event_id)
      or (resolved_source_validation_case_id is not null and oml.source_validation_case_id = resolved_source_validation_case_id)
    )
  limit 1;

  if existing_link_id is not null then
    return existing_link_id;
  end if;

  insert into public.organization_memory_links (
    organization_memory_item_id,
    organization_id,
    link_type,
    source_event_id,
    source_ai_interaction_id,
    source_correction_event_id,
    source_validation_case_id,
    source_entity_type,
    source_entity_id,
    weight,
    confidence_delta,
    note,
    created_by_user_id
  )
  values (
    resolved_memory_item_id,
    resolved_organization_id,
    resolved_link_type,
    resolved_source_event_id,
    resolved_source_ai_interaction_id,
    resolved_source_correction_event_id,
    resolved_source_validation_case_id,
    nullif(btrim(coalesce(p_input->>'sourceEntityType', '')), ''),
    nullif(p_input->>'sourceEntityId', '')::uuid,
    coalesce(nullif(p_input->>'weight', '')::numeric, 1),
    resolved_confidence_delta,
    nullif(p_input->>'note', ''),
    auth.uid()
  )
  returning id into inserted_id;

  update public.organization_memory_items
  set
    confidence_score = least(greatest(confidence_score + resolved_confidence_delta, 0), 1),
    derived_from_event_count = derived_from_event_count + case when resolved_source_event_id is not null then 1 else 0 end,
    derived_from_ai_interaction_count = derived_from_ai_interaction_count + case when resolved_source_ai_interaction_id is not null then 1 else 0 end,
    derived_from_correction_count = derived_from_correction_count + case when resolved_source_correction_event_id is not null then 1 else 0 end,
    derived_from_validation_count = derived_from_validation_count + case when resolved_source_validation_case_id is not null then 1 else 0 end,
    derived_from_total_count = derived_from_total_count + 1,
    reinforcement_count = reinforcement_count + case when resolved_link_type in ('seed', 'supporting', 'confirmation') then 1 else 0 end,
    contradiction_count = contradiction_count + case when resolved_link_type in ('contradiction', 'supersession') then 1 else 0 end,
    first_derived_at = coalesce(first_derived_at, now()),
    last_derived_at = now(),
    last_reinforced_at = case
      when resolved_link_type in ('seed', 'supporting', 'confirmation') then now()
      else last_reinforced_at
    end,
    last_contradicted_at = case
      when resolved_link_type in ('contradiction', 'supersession') then now()
      else last_contradicted_at
    end,
    updated_at = now()
  where id = resolved_memory_item_id
    and organization_id = resolved_organization_id;

  return inserted_id;
end;
$$;

create policy "Platform admins can read organization memory items"
on public.organization_memory_items
for select
to authenticated
using (
  public.has_platform_admin_role('viewer')
);

create policy "Platform admins can manage organization memory items"
on public.organization_memory_items
for all
to authenticated
using (
  public.has_platform_admin_role('admin')
)
with check (
  public.has_platform_admin_role('admin')
);

create policy "Platform admins can read organization memory links"
on public.organization_memory_links
for select
to authenticated
using (
  public.has_platform_admin_role('viewer')
);

create policy "Platform admins can manage organization memory links"
on public.organization_memory_links
for all
to authenticated
using (
  public.has_platform_admin_role('admin')
)
with check (
  public.has_platform_admin_role('admin')
);

revoke all on public.organization_memory_items from public, anon, authenticated;
revoke all on public.organization_memory_links from public, anon, authenticated;

grant select, insert, update, delete on public.organization_memory_items to authenticated;
grant select, insert, update, delete on public.organization_memory_links to authenticated;

grant execute on function public.upsert_organization_memory_item(jsonb) to authenticated;
grant execute on function public.link_organization_memory_evidence(jsonb) to authenticated;
