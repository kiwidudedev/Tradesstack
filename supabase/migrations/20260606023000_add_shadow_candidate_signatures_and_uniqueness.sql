create extension if not exists pgcrypto with schema extensions;

create or replace function public._worksheet_pricing_pattern_shadow_normalize_text(
  p_value text
)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_value, ''))), '\s+', ' ', 'g'), '');
$$;

create or replace function public._worksheet_pricing_pattern_shadow_scope_signature(
  p_scope jsonb
)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'tradePackage', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'tradePackage', null)),
          'pageType', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'pageType', null)),
          'worksheetNameHint', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'worksheetNameHint', null)),
          'itemCategory', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'itemCategory', null)),
          'normalizedUnit', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'normalizedUnit', null)),
          'costRole', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'costRole', null)),
          'sectionType', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_scope->>'sectionType', null))
        )::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public._worksheet_pricing_pattern_shadow_pattern_value_signature(
  p_pattern_family text,
  p_pattern_type text,
  p_pattern_value jsonb
)
returns text
language sql
immutable
as $$
  with normalized_signals as (
    select coalesce(
      jsonb_agg(to_jsonb(signal) order by signal),
      '[]'::jsonb
    ) as signals
    from (
      select distinct public._worksheet_pricing_pattern_shadow_normalize_text(value #>> '{}') as signal
      from jsonb_array_elements(coalesce(p_pattern_value->'signals', '[]'::jsonb))
      where public._worksheet_pricing_pattern_shadow_normalize_text(value #>> '{}') is not null
    ) normalized
  )
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'patternFamily', public._worksheet_pricing_pattern_shadow_normalize_text(p_pattern_family),
          'patternType', public._worksheet_pricing_pattern_shadow_normalize_text(p_pattern_type),
          'summary', public._worksheet_pricing_pattern_shadow_normalize_text(coalesce(p_pattern_value->>'summary', null)),
          'signals', (select signals from normalized_signals)
        )::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public._worksheet_pricing_pattern_shadow_candidate_signature(
  p_organization_id uuid,
  p_pattern_family text,
  p_pattern_type text,
  p_scope jsonb,
  p_pattern_value jsonb
)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'organizationId', public._worksheet_pricing_pattern_shadow_normalize_text(p_organization_id::text),
          'patternFamily', public._worksheet_pricing_pattern_shadow_normalize_text(p_pattern_family),
          'patternType', public._worksheet_pricing_pattern_shadow_normalize_text(p_pattern_type),
          'scopeSignature', public._worksheet_pricing_pattern_shadow_scope_signature(p_scope),
          'patternValueSignature', public._worksheet_pricing_pattern_shadow_pattern_value_signature(p_pattern_family, p_pattern_type, p_pattern_value)
        )::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

alter table public.worksheet_pricing_pattern_shadow_candidates
  add column if not exists scope_signature text,
  add column if not exists pattern_value_signature text,
  add column if not exists candidate_signature text,
  add column if not exists signature_uniqueness_enabled boolean not null default true;

update public.worksheet_pricing_pattern_shadow_candidates
set
  scope_signature = public._worksheet_pricing_pattern_shadow_scope_signature(scope),
  pattern_value_signature = public._worksheet_pricing_pattern_shadow_pattern_value_signature(pattern_family, pattern_type, pattern_value),
  candidate_signature = public._worksheet_pricing_pattern_shadow_candidate_signature(
    organization_id,
    pattern_family,
    pattern_type,
    scope,
    pattern_value
  ),
  updated_at = now()
where
  scope_signature is null
  or pattern_value_signature is null
  or candidate_signature is null;

with duplicate_groups as (
  select organization_id, candidate_signature
  from public.worksheet_pricing_pattern_shadow_candidates
  where candidate_status <> 'retired'
  group by organization_id, candidate_signature
  having count(*) > 1
)
update public.worksheet_pricing_pattern_shadow_candidates c
set
  signature_uniqueness_enabled = false,
  updated_at = now()
from duplicate_groups d
where c.organization_id = d.organization_id
  and c.candidate_signature = d.candidate_signature
  and c.candidate_status <> 'retired';

alter table public.worksheet_pricing_pattern_shadow_candidates
  alter column scope_signature set not null,
  alter column pattern_value_signature set not null,
  alter column candidate_signature set not null;

create index if not exists worksheet_pricing_pattern_shadow_candidates_signature_idx
  on public.worksheet_pricing_pattern_shadow_candidates (organization_id, candidate_signature, updated_at desc);

create unique index if not exists worksheet_pricing_pattern_shadow_candidates_active_signature_unique_idx
  on public.worksheet_pricing_pattern_shadow_candidates (organization_id, candidate_signature)
  where candidate_status <> 'retired' and signature_uniqueness_enabled;

create or replace function public.upsert_worksheet_pricing_pattern_shadow_candidate(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
  resolved_candidate_signature text;
  existing_row public.worksheet_pricing_pattern_shadow_candidates%rowtype;
  inserted_row public.worksheet_pricing_pattern_shadow_candidates%rowtype;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'upsert_worksheet_pricing_pattern_shadow_candidate requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organization_id', '')::uuid;
  resolved_candidate_signature := nullif(btrim(coalesce(p_input->>'candidate_signature', '')), '');

  if resolved_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if resolved_candidate_signature is null then
    raise exception 'candidate_signature is required';
  end if;

  select *
  into existing_row
  from public.worksheet_pricing_pattern_shadow_candidates c
  where c.organization_id = resolved_organization_id
    and c.candidate_signature = resolved_candidate_signature
    and c.candidate_status <> 'retired'
  order by c.signature_uniqueness_enabled desc, c.created_at asc, c.id asc
  limit 1;

  if found then
    return jsonb_build_object(
      'candidate', to_jsonb(existing_row),
      'inserted', false
    );
  end if;

  insert into public.worksheet_pricing_pattern_shadow_candidates (
    organization_id,
    candidate_status,
    pattern_family,
    pattern_type,
    current_strength,
    confidence,
    title,
    summary,
    retrieval_guidance,
    scope,
    pattern_value,
    scope_signature,
    pattern_value_signature,
    candidate_signature,
    signature_uniqueness_enabled,
    support_count,
    contradiction_count,
    ignored_count,
    support_diversity,
    contradiction_diversity,
    last_reinforced_at,
    last_contradicted_at,
    stale_after,
    created_by_run_id,
    last_updated_by_run_id
  )
  values (
    nullif(p_input->>'organization_id', '')::uuid,
    coalesce(nullif(btrim(coalesce(p_input->>'candidate_status', '')), ''), 'active'),
    nullif(btrim(coalesce(p_input->>'pattern_family', '')), ''),
    nullif(btrim(coalesce(p_input->>'pattern_type', '')), ''),
    nullif(btrim(coalesce(p_input->>'current_strength', '')), ''),
    nullif(p_input->>'confidence', '')::numeric,
    nullif(btrim(coalesce(p_input->>'title', '')), ''),
    nullif(btrim(coalesce(p_input->>'summary', '')), ''),
    nullif(btrim(coalesce(p_input->>'retrieval_guidance', '')), ''),
    coalesce(p_input->'scope', '{}'::jsonb),
    coalesce(p_input->'pattern_value', '{}'::jsonb),
    nullif(btrim(coalesce(p_input->>'scope_signature', '')), ''),
    nullif(btrim(coalesce(p_input->>'pattern_value_signature', '')), ''),
    resolved_candidate_signature,
    coalesce((p_input->>'signature_uniqueness_enabled')::boolean, true),
    greatest(coalesce(nullif(p_input->>'support_count', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'contradiction_count', '')::integer, 0), 0),
    greatest(coalesce(nullif(p_input->>'ignored_count', '')::integer, 0), 0),
    coalesce(p_input->'support_diversity', '{}'::jsonb),
    coalesce(p_input->'contradiction_diversity', 'null'::jsonb),
    nullif(p_input->>'last_reinforced_at', '')::timestamptz,
    nullif(p_input->>'last_contradicted_at', '')::timestamptz,
    nullif(p_input->>'stale_after', '')::timestamptz,
    nullif(p_input->>'created_by_run_id', '')::uuid,
    nullif(p_input->>'last_updated_by_run_id', '')::uuid
  )
  on conflict (organization_id, candidate_signature)
  where candidate_status <> 'retired' and signature_uniqueness_enabled
  do nothing
  returning *
  into inserted_row;

  if inserted_row.id is null then
    select *
    into existing_row
    from public.worksheet_pricing_pattern_shadow_candidates c
    where c.organization_id = resolved_organization_id
      and c.candidate_signature = resolved_candidate_signature
      and c.candidate_status <> 'retired'
    order by c.signature_uniqueness_enabled desc, c.created_at asc, c.id asc
    limit 1;

    if found then
      return jsonb_build_object(
        'candidate', to_jsonb(existing_row),
        'inserted', false
      );
    end if;
  end if;

  return jsonb_build_object(
    'candidate', to_jsonb(inserted_row),
    'inserted', true
  );
end;
$$;

grant execute on function public.upsert_worksheet_pricing_pattern_shadow_candidate(jsonb) to service_role;
