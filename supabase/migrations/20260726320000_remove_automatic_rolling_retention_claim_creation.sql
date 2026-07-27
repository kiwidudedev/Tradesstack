begin;

-- Retention ownership is a project ledger. Retention Claim documents are
-- deliberate withdrawals from that ledger and must never be projected from a
-- Payment Claim lifecycle transition.
drop trigger if exists project_claims_retention_rolling_draft_projection
on public.project_claims;

create or replace function public.enqueue_retention_rolling_draft_after_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

create or replace function private.enqueue_retention_rolling_draft(
  p_originating_payment_claim_id uuid,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Retired. Kept as a no-op so previously compiled callers cannot create a
  -- Retention Claim or consume an RC number.
  return;
end;
$$;

create or replace function private.maintain_retention_rolling_draft(
  p_originating_payment_claim_id uuid,
  p_operation text,
  p_correlation_id text,
  p_retry_count integer default 0
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'succeeded', true,
    'changed', false,
    'result', 'retired'
  );
$$;

create or replace function public.process_retention_rolling_draft_jobs(
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'processed', 0,
    'succeeded', 0,
    'failed', 0,
    'retired', true
  );
$$;

-- Every project may have at most one editable Retention Claim regardless of
-- whether it predates this product correction.
create unique index if not exists
  retention_claims_one_editable_draft_per_project_idx
on public.retention_claims(organization_id, project_id)
where status = 'draft';

-- An untouched historical automatic Draft may be adopted only inside the
-- explicit user creation transaction. No other Draft-kind mutation is valid.
create or replace function public.protect_retention_claim_draft_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.draft_kind is distinct from old.draft_kind
    and not (
      old.status = 'draft'
      and new.status = 'draft'
      and old.draft_kind = 'automatic_rolling'
      and new.draft_kind = 'manual'
      and current_setting(
        'app.retention_explicit_draft_adoption',
        true
      ) = 'true'
    )
  then
    raise exception 'Retention Claim Draft kind is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.create_retention_claim_draft(
  p_project_id uuid,
  p_title text default 'New Retention Claim',
  p_reference text default null,
  p_issue_date date default null,
  p_due_date date default null,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_context jsonb;
  v_organization_id uuid;
  v_actor_user_id uuid;
  v_position jsonb;
  v_eligibility jsonb;
  v_available numeric(14,2);
  v_claim public.retention_claims%rowtype;
  v_adopted boolean := false;
begin
  v_context := private.retention_claim_operation_context(
    p_project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    if v_context ->> 'organizationId' is not null then
      perform private.record_retention_claim_event(
        (v_context ->> 'organizationId')::uuid,
        p_project_id,
        null,
        'permission_denied',
        null,
        null,
        auth.uid(),
        v_context ->> 'errorCode',
        p_correlation_id,
        jsonb_build_object('operation', 'create_retention_claim_draft')
      );
    end if;
    return v_context;
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null
    or (
      p_issue_date is not null
      and p_due_date is not null
      and p_due_date < p_issue_date
    )
  then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_transition'
    );
  end if;

  v_organization_id := (v_context ->> 'organizationId')::uuid;
  v_actor_user_id := (v_context ->> 'actorUserId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_organization_id::text || ':' || p_project_id::text
        || ':explicit_retention_claim_draft',
      7
    )
  );

  select claim.*
  into v_claim
  from public.retention_claims claim
  where claim.organization_id = v_organization_id
    and claim.project_id = p_project_id
    and claim.status = 'draft'
  order by
    case claim.draft_kind when 'manual' then 0 else 1 end,
    claim.created_at,
    claim.id
  limit 1
  for update;

  if v_claim.id is not null then
    if v_claim.draft_kind = 'automatic_rolling' then
      perform set_config(
        'app.retention_explicit_draft_adoption',
        'true',
        true
      );
      update public.retention_claims
      set draft_kind = 'manual'
      where id = v_claim.id
      returning * into v_claim;
      perform set_config(
        'app.retention_explicit_draft_adoption',
        '',
        true
      );
      v_adopted := true;
      perform private.record_retention_claim_event(
        v_claim.organization_id,
        v_claim.project_id,
        v_claim.id,
        'draft_updated',
        'draft',
        'draft',
        v_actor_user_id,
        'Existing Draft opened by the explicit New Retention Claim action.',
        p_correlation_id,
        jsonb_build_object(
          'explicitCreation', true,
          'adoptedAutomaticDraft', true,
          'claimNumber', v_claim.claim_number
        )
      );
    end if;
    return jsonb_build_object(
      'succeeded', true,
      'errorCode', null,
      'reused', true,
      'adoptedAutomaticDraft', v_adopted,
      'claim', private.retention_claim_header_json(v_claim.id)
    );
  end if;

  v_eligibility := private.retention_eligibility_state(p_project_id);
  select coalesce(round(sum(
    greatest(coalesce((origin ->> 'availableRetention')::numeric, 0), 0)
  ), 2), 0)
  into v_available
  from jsonb_array_elements(
    coalesce(v_eligibility -> 'origins', '[]'::jsonb)
  ) origin;
  if v_available <= 0 then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'no_available_retention'
    );
  end if;

  v_position := public.get_project_retention_position_summary(p_project_id);
  insert into public.retention_claims (
    organization_id,
    project_id,
    claim_number,
    title,
    reference,
    issue_date,
    due_date,
    last_position_state_hash,
    last_eligibility_state_hash,
    created_by,
    draft_kind
  )
  values (
    v_organization_id,
    p_project_id,
    private.generate_retention_claim_number(
      v_organization_id,
      p_project_id
    ),
    trim(p_title),
    nullif(trim(coalesce(p_reference, '')), ''),
    p_issue_date,
    p_due_date,
    v_position ->> 'stateHash',
    v_eligibility ->> 'eligibilityStateHash',
    v_actor_user_id,
    'manual'
  )
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id,
    v_claim.project_id,
    v_claim.id,
    'claim_created',
    null,
    'draft',
    v_actor_user_id,
    'Retention Claim Draft created by explicit user action.',
    p_correlation_id,
    jsonb_build_object(
      'claimNumber', v_claim.claim_number,
      'draftRevision', v_claim.draft_revision,
      'explicitCreation', true,
      'availableRetention', v_available
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'reused', false,
    'adoptedAutomaticDraft', false,
    'claim', private.retention_claim_header_json(v_claim.id)
  );
end;
$$;

-- Manual Draft editors obtain candidate source hashes from the project ledger.
-- Candidate membership itself is guarded by the eligibility hash on Save.
create or replace function public.get_retention_claim_draft_origin_set_hash(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
begin
  select *
  into v_claim
  from public.retention_claims
  where id = p_retention_claim_id;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'retention_claim_not_found';
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.view',
    false
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false)
    or (v_context ->> 'organizationId')::uuid <> v_claim.organization_id
  then
    return v_context;
  end if;

  return jsonb_build_object(
    'retentionClaimId', v_claim.id,
    'originSetHash',
      private.retention_claim_draft_origin_set_hash(v_claim.id),
    'originStateHashes', coalesce((
      select jsonb_object_agg(
        origin.id::text,
        private.retention_claim_origin_state_hash(origin.id)
      )
      from public.project_claims origin
      where origin.organization_id = v_claim.organization_id
        and origin.project_id = v_claim.project_id
        and origin.status <> 'Cancelled'
        and round(
          greatest(coalesce(origin.retention_withheld_amount, 0), 0),
          2
        ) > 0
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.create_retention_claim_draft(
  uuid, text, text, date, date, text
) from public, anon;
grant execute on function public.create_retention_claim_draft(
  uuid, text, text, date, date, text
) to authenticated;

revoke all on function public.get_retention_claim_draft_origin_set_hash(uuid)
from public, anon;
grant execute on function public.get_retention_claim_draft_origin_set_hash(uuid)
to authenticated;

revoke all on function public.process_retention_rolling_draft_jobs(integer)
from public, anon, authenticated;
grant execute on function public.process_retention_rolling_draft_jobs(integer)
to service_role;

revoke all on function public.enqueue_retention_rolling_draft_after_claim()
from public, anon, authenticated;
revoke all on function private.enqueue_retention_rolling_draft(uuid, text)
from public, anon, authenticated;
revoke all on function private.maintain_retention_rolling_draft(
  uuid, text, text, integer
) from public, anon, authenticated;

commit;
