begin;

-- Create the single operational master only for a clean project. Existing
-- Retention history is never merged implicitly.
create or replace function private.ensure_master_retention_claim(
  p_organization_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_master_id uuid;
  v_claim_number text;
  v_subtotal numeric(14,2);
  v_issue_date date;
  v_due_date date;
  v_state_hash text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_project_id::text
        || ':master_retention_claim',
      2634
    )
  );

  select claim.id into v_master_id
  from public.retention_claims claim
  where claim.organization_id = p_organization_id
    and claim.project_id = p_project_id
    and claim.master_role = 'master_retention_claim'
  limit 1;
  if v_master_id is not null then
    return v_master_id;
  end if;

  -- Historical projects require a reviewed classification. Never manufacture
  -- a second commercial identity beside existing Retention records.
  if exists (
    select 1 from public.retention_claims claim
    where claim.organization_id = p_organization_id
      and claim.project_id = p_project_id
  ) then
    return null;
  end if;

  select
    round(sum(greatest(coalesce(claim.retention_withheld_amount, 0), 0)), 2),
    min(claim.claim_date),
    max(claim.due_date)
  into v_subtotal, v_issue_date, v_due_date
  from public.project_claims claim
  where claim.organization_id = p_organization_id
    and claim.project_id = p_project_id
    and claim.status = 'Submitted'
    and round(greatest(
      coalesce(claim.retention_withheld_amount, 0), 0
    ), 2) > 0;
  if coalesce(v_subtotal, 0) <= 0 then
    return null;
  end if;

  v_claim_number := private.generate_retention_claim_number(
    p_organization_id,
    p_project_id
  );
  if v_claim_number !~ '-RC-01$' then
    raise exception
      'A clean project master Retention identity must be RC-01.';
  end if;
  v_state_hash := encode(digest(convert_to(jsonb_build_object(
    'organizationId', p_organization_id,
    'projectId', p_project_id,
    'claimNumber', v_claim_number,
    'initialSubtotal', v_subtotal
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.retention_claims(
    organization_id, project_id, claim_number, title,
    issue_date, due_date, status, subtotal_excl_tax,
    submission_state_hash, submitted_by, submitted_at, created_by,
    draft_kind, master_role
  ) values (
    p_organization_id, p_project_id, v_claim_number, 'Retention Claim',
    v_issue_date, v_due_date, 'submitted', v_subtotal,
    v_state_hash, p_actor_user_id, now(), p_actor_user_id,
    'manual', 'master_retention_claim'
  )
  returning id into v_master_id;

  perform private.record_retention_claim_event(
    p_organization_id, p_project_id, v_master_id,
    'claim_created', null, 'submitted', p_actor_user_id,
    'Master Retention Claim initialized from submitted Payment Claim retention.',
    'master-retention-initialization:' || v_master_id::text,
    jsonb_build_object(
      'masterRetentionClaim', true,
      'claimNumber', v_claim_number,
      'initialCumulativeRetention', v_subtotal
    )
  );
  perform private.record_retention_claim_event(
    p_organization_id, p_project_id, v_master_id,
    'claim_submitted', null, 'submitted', p_actor_user_id,
    'Master Retention Claim uses cumulative structured Payment Claim evidence.',
    'master-retention-initialization:' || v_master_id::text,
    jsonb_build_object(
      'masterRetentionClaim', true,
      'structuredEvidenceOnly', true
    )
  );
  return v_master_id;
end;
$$;

create or replace function public.ensure_master_retention_claim_after_payment_claim()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'Submitted'
    and round(greatest(
      coalesce(new.retention_withheld_amount, 0), 0
    ), 2) > 0 then
    perform private.ensure_master_retention_claim(
      new.organization_id,
      new.project_id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_claims_master_retention_initialization
  on public.project_claims;
create trigger project_claims_master_retention_initialization
after insert or update of status, retention_withheld_amount
on public.project_claims
for each row execute function
  public.ensure_master_retention_claim_after_payment_claim();

-- Backfill only clean projects. Projects with any Retention history remain
-- untouched and require the reviewed classification in the preceding migration.
do $$
declare
  origin record;
begin
  for origin in
    select distinct on (claim.organization_id, claim.project_id)
      claim.organization_id, claim.project_id, claim.created_by
    from public.project_claims claim
    where claim.status = 'Submitted'
      and round(greatest(
        coalesce(claim.retention_withheld_amount, 0), 0
      ), 2) > 0
      and not exists (
        select 1 from public.retention_claims retention_claim
        where retention_claim.organization_id = claim.organization_id
          and retention_claim.project_id = claim.project_id
      )
    order by claim.organization_id, claim.project_id,
      claim.created_at, claim.id
  loop
    perform private.ensure_master_retention_claim(
      origin.organization_id,
      origin.project_id,
      origin.created_by
    );
  end loop;
end;
$$;

-- The legacy explicit RPC remains for compatibility, but can no longer allocate
-- RC-02 or create a second operational document.
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
  v_master public.retention_claims%rowtype;
begin
  v_context := private.retention_claim_operation_context(
    p_project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context->>'succeeded')::boolean, false) then
    return v_context;
  end if;
  select claim.* into v_master
  from public.retention_claims claim
  where claim.organization_id = (v_context->>'organizationId')::uuid
    and claim.project_id = p_project_id
    and claim.master_role = 'master_retention_claim'
  limit 1;
  if v_master.id is not null then
    return jsonb_build_object(
      'succeeded', true,
      'errorCode', null,
      'reused', true,
      'masterRetentionClaim', true,
      'claim', private.retention_claim_header_json(v_master.id)
    );
  end if;
  return jsonb_build_object(
    'succeeded', false,
    'errorCode', 'master_requires_submitted_payment_claim'
  );
end;
$$;

revoke all on function private.ensure_master_retention_claim(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ensure_master_retention_claim_after_payment_claim()
  from public, anon, authenticated;
grant execute on function public.ensure_master_retention_claim_after_payment_claim()
  to service_role;

commit;
