begin;

-- Phase 2 derives a canonical Retention Position from persisted Payment Claim
-- snapshots. It deliberately creates no financial tables and performs no writes.

create extension if not exists pgcrypto with schema extensions;

create index if not exists project_claims_retention_position_chronology_idx
  on public.project_claims (
    project_id,
    claim_date asc nulls last,
    created_at asc,
    id asc
  );

create or replace function public.get_project_retention_position_summary(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_internal boolean :=
    auth.uid() is null and coalesce(auth.role(), '') = 'service_role';
  v_organization_id uuid;
  v_capability_enabled boolean := false;
  v_mode text := 'legacy';
  v_access_state text;
  v_result jsonb;
begin
  if p_project_id is null then
    return jsonb_build_object(
      'accessState', 'project_not_found',
      'observationEligible', false
    );
  end if;

  if v_is_internal then
    select project.organization_id
    into v_organization_id
    from public.organization_projects project
    where project.id = p_project_id;
  elsif v_actor_user_id is not null then
    select project.organization_id
    into v_organization_id
    from public.organization_projects project
    join public.organization_members member
      on member.organization_id = project.organization_id
     and member.user_id = v_actor_user_id
    where project.id = p_project_id;
  end if;

  if v_organization_id is null then
    return jsonb_build_object(
      'accessState',
      case
        when v_is_internal then 'project_not_found'
        else 'not_found_or_denied'
      end,
      'observationEligible', false
    );
  end if;

  if not v_is_internal
    and not public.has_org_permission(v_organization_id, 'retention.view') then
    return jsonb_build_object(
      'accessState', 'permission_denied',
      'observationEligible', false
    );
  end if;

  select coalesce(capability.enabled, false)
  into v_capability_enabled
  from public.organization_capabilities capability
  where capability.organization_id = v_organization_id
    and capability.capability_key = 'retention_management';

  select coalesce(state.mode, 'legacy')
  into v_mode
  from public.project_retention_workflow_states state
  where state.organization_id = v_organization_id
    and state.project_id = p_project_id;

  v_access_state := case
    when v_is_internal then 'internal_diagnostics'
    when not v_capability_enabled then 'capability_disabled'
    when v_mode = 'observe' then 'available'
    when v_mode = 'legacy' then 'legacy_mode'
    else 'inactive_mode'
  end;

  if not v_is_internal and (not v_capability_enabled or v_mode <> 'observe') then
    return jsonb_build_object(
      'organizationId', v_organization_id,
      'projectId', p_project_id,
      'capabilityEnabled', v_capability_enabled,
      'workflowMode', v_mode,
      'accessState', v_access_state,
      'observationEligible', false
    );
  end if;

  with ordered_claims as (
    select
      claim.*,
      row_number() over (
        order by
          claim.claim_date asc nulls last,
          claim.created_at asc,
          claim.id asc
      )::integer as chronological_sequence,
      round(
        sum(
          case
            when claim.status <> 'Cancelled'
              then coalesce(claim.retention_withheld_amount, 0)
                   - coalesce(claim.retention_released_amount, 0)
            else 0
          end
        ) over (
          order by
            claim.claim_date asc nulls last,
            claim.created_at asc,
            claim.id asc
          rows between unbounded preceding and current row
        ),
        2
      ) as expected_cumulative_balance
    from public.project_claims claim
    where claim.organization_id = v_organization_id
      and claim.project_id = p_project_id
  ),
  aggregate_values as (
    select
      count(*)::integer as payment_claim_count,
      count(*) filter (where status <> 'Cancelled')::integer as active_claim_count,
      count(*) filter (
        where status <> 'Cancelled'
          and coalesce(retention_withheld_amount, 0) > 0
      )::integer as retention_origin_count,
      count(*) filter (
        where status <> 'Cancelled'
          and coalesce(retention_released_amount, 0) <> 0
      )::integer as legacy_release_claim_count,
      count(*) filter (
        where status <> 'Cancelled'
          and coalesce(retention_balance, 0) < 0
      )::integer as negative_retention_balance_claim_count,
      count(*) filter (where status = 'Cancelled')::integer as cancelled_claim_count,
      round(coalesce(sum(coalesce(retention_withheld_amount, 0)) filter (
        where status <> 'Cancelled'
      ), 0), 2) as total_retention_withheld,
      round(coalesce(sum(coalesce(retention_released_amount, 0)) filter (
        where status <> 'Cancelled'
      ), 0), 2) as total_legacy_retention_released,
      round(coalesce(sum(
        coalesce(retention_withheld_amount, 0)
        - coalesce(retention_released_amount, 0)
      ) filter (where status <> 'Cancelled'), 0), 2) as movement_derived_balance,
      max(claim_date) filter (
        where status <> 'Cancelled'
          and (
            coalesce(retention_withheld_amount, 0) <> 0
            or coalesce(retention_released_amount, 0) <> 0
          )
      ) as latest_relevant_claim_date,
      max(updated_at) as latest_persisted_update_at
    from ordered_claims
  ),
  latest_active_snapshot as (
    select retention_balance
    from ordered_claims
    where status <> 'Cancelled'
    order by
      claim_date desc nulls first,
      created_at desc,
      id desc
    limit 1
  ),
  project_diagnostics as (
    select jsonb_agg(diagnostic order by diagnostic ->> 'code')
      filter (where diagnostic is not null) as diagnostics
    from (
      select case
        when aggregate_values.movement_derived_balance < 0 then
          jsonb_build_object(
            'code', 'negative_project_retention_balance',
            'severity', 'blocking_for_future_cutover',
            'message', 'The movement-derived project retention balance is negative.'
          )
      end as diagnostic
      from aggregate_values

      union all

      select case
        when aggregate_values.total_legacy_retention_released > 0 then
          jsonb_build_object(
            'code', 'legacy_reconciliation_required',
            'severity', 'warning',
            'message', 'Persisted legacy retention releases require future reconciliation.'
          )
      end
      from aggregate_values

      union all

      select case
        when coalesce(latest_active_snapshot.retention_balance, 0)
          <> aggregate_values.movement_derived_balance then
          jsonb_build_object(
            'code', 'latest_cumulative_snapshot_mismatch',
            'severity', 'blocking_for_future_cutover',
            'message', 'The latest persisted cumulative balance differs from the movement-derived balance.'
          )
      end
      from aggregate_values
      left join latest_active_snapshot on true

      union all

      select case
        when exists (
          select 1
          from ordered_claims claim
          where claim.status <> 'Cancelled'
            and claim.expected_cumulative_balance < 0
        ) then
          jsonb_build_object(
            'code', 'legacy_releases_exceed_held',
            'severity', 'blocking_for_future_cutover',
            'message', 'A chronological legacy release movement exceeds retention held at that point.'
          )
      end

      union all

      select case
        when exists (
          select 1
          from ordered_claims claim
          where claim.status = 'Cancelled'
            and (
              coalesce(claim.retention_withheld_amount, 0) <> 0
              or coalesce(claim.retention_released_amount, 0) <> 0
            )
        ) then
          jsonb_build_object(
            'code', 'cancelled_claim_has_retention_movement',
            'severity', 'warning',
            'message', 'A cancelled Payment Claim retains persisted retention movements.'
          )
      end

      union all

      select case
        when exists (
          select 1 from ordered_claims claim where claim.claim_date is null
        ) then
          jsonb_build_object(
            'code', 'missing_claim_date',
            'severity', 'info',
            'message', 'A Payment Claim has no claim date and sorts after dated claims.'
          )
      end

      union all

      select case
        when exists (
          select 1
          from ordered_claims claim
          where claim.status not in (
            'Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled'
          )
        ) then
          jsonb_build_object(
            'code', 'unexpected_claim_status',
            'severity', 'blocking_for_future_cutover',
            'message', 'A Payment Claim has a status outside the supported persisted set.'
          )
      end

      union all

      select case
        when exists (
          select 1
          from ordered_claims claim
          where claim.retention_percent is null
             or claim.retention_withheld_amount is null
             or claim.retention_released_amount is null
             or claim.retention_held_to_date is null
             or claim.retention_released_to_date is null
             or claim.retention_balance is null
             or claim.claim_amount is null
             or claim.net_claim_excl_gst is null
             or claim.gst_amount is null
             or claim.total_payable is null
        ) then
          jsonb_build_object(
            'code', 'unexpected_null_financial_field',
            'severity', 'blocking_for_future_cutover',
            'message', 'A required persisted Payment Claim financial field is null.'
          )
      end

      union all

      select case
        when exists (
          select 1
          from ordered_claims claim
          where round(coalesce(claim.retention_balance, 0), 2)
            <> claim.expected_cumulative_balance
        ) then
          jsonb_build_object(
            'code', 'cumulative_snapshot_mismatch',
            'severity', 'blocking_for_future_cutover',
            'message', 'At least one persisted cumulative retention snapshot differs from chronological movements.'
          )
      end
    ) values_with_optional_diagnostics
  ),
  hash_input as (
    select concat_ws(
      '|',
      p_project_id::text,
      v_organization_id::text,
      case when v_capability_enabled then '1' else '0' end,
      v_mode,
      coalesce(
        string_agg(
          concat_ws(
            ':',
            claim.id::text,
            claim.chronological_sequence::text,
            claim.status,
            coalesce(claim.claim_date::text, ''),
            to_char(claim.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
            to_char(claim.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
            to_char(round(claim.retention_percent, 3), 'FM999999999999999999990.000'),
            claim.retention_method,
            coalesce(claim.retention_scale_bands::text, ''),
            to_char(round(claim.retention_withheld_amount, 2), 'FM999999999999999999990.00'),
            to_char(round(claim.retention_released_amount, 2), 'FM999999999999999999990.00'),
            to_char(round(claim.retention_held_to_date, 2), 'FM999999999999999999990.00'),
            to_char(round(claim.retention_released_to_date, 2), 'FM999999999999999999990.00'),
            to_char(round(claim.retention_balance, 2), 'FM999999999999999999990.00')
          ),
          ',' order by claim.chronological_sequence
        ),
        ''
      )
    ) as serialized_state
    from ordered_claims claim
  ),
  legacy_release_origins as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'paymentClaimId', claim.id,
          'claimNumber', claim.claim_number,
          'claimDate', claim.claim_date,
          'effectiveDate', claim.claim_date,
          'retentionReleasedAmount', claim.retention_released_amount,
          'chronologicalSequence', claim.chronological_sequence
        )
        order by claim.chronological_sequence
      ) filter (
        where claim.status <> 'Cancelled'
          and coalesce(claim.retention_released_amount, 0) <> 0
      ),
      '[]'::jsonb
    ) as origins
    from ordered_claims claim
  )
  select jsonb_build_object(
    'organizationId', v_organization_id,
    'projectId', p_project_id,
    'capabilityEnabled', v_capability_enabled,
    'workflowMode', v_mode,
    'accessState', v_access_state,
    'observationEligible', v_capability_enabled and v_mode = 'observe',
    'paymentClaimCount', aggregate_values.payment_claim_count,
    'activePaymentClaimCount', aggregate_values.active_claim_count,
    'retentionOriginCount', aggregate_values.retention_origin_count,
    'legacyReleaseClaimCount', aggregate_values.legacy_release_claim_count,
    'negativeRetentionBalanceClaimCount',
      aggregate_values.negative_retention_balance_claim_count,
    'cancelledClaimCount', aggregate_values.cancelled_claim_count,
    'totalRetentionWithheld', aggregate_values.total_retention_withheld,
    'totalLegacyRetentionReleased',
      aggregate_values.total_legacy_retention_released,
    'movementDerivedRetentionBalance',
      aggregate_values.movement_derived_balance,
    'latestPersistedCumulativeRetentionBalance',
      coalesce(latest_active_snapshot.retention_balance, 0),
    'latestRelevantPaymentClaimDate',
      aggregate_values.latest_relevant_claim_date,
    'latestPersistedUpdateAt',
      aggregate_values.latest_persisted_update_at,
    'legacyReconciliationRequired',
      aggregate_values.total_legacy_retention_released <> 0,
    'legacyReleaseOrigins', legacy_release_origins.origins,
    'diagnostics', coalesce(project_diagnostics.diagnostics, '[]'::jsonb),
    'stateHash', encode(
      extensions.digest(hash_input.serialized_state, 'sha256'),
      'hex'
    )
  )
  into v_result
  from aggregate_values
  left join latest_active_snapshot on true
  cross join project_diagnostics
  cross join hash_input
  cross join legacy_release_origins;

  return v_result;
end;
$$;

create or replace function public.get_project_retention_position_page(
  p_project_id uuid,
  p_page_size integer default 50,
  p_after_claim_date date default null,
  p_after_created_at timestamptz default null,
  p_after_claim_id uuid default null,
  p_statuses text[] default null,
  p_positive_retention boolean default null,
  p_legacy_release boolean default null,
  p_diagnostic_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_internal boolean :=
    auth.uid() is null and coalesce(auth.role(), '') = 'service_role';
  v_organization_id uuid;
  v_capability_enabled boolean := false;
  v_mode text := 'legacy';
  v_access_state text;
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 50), 200));
  v_result jsonb;
begin
  if p_project_id is null then
    return jsonb_build_object(
      'accessState', 'project_not_found',
      'origins', '[]'::jsonb,
      'hasMore', false
    );
  end if;

  if v_is_internal then
    select project.organization_id
    into v_organization_id
    from public.organization_projects project
    where project.id = p_project_id;
  elsif v_actor_user_id is not null then
    select project.organization_id
    into v_organization_id
    from public.organization_projects project
    join public.organization_members member
      on member.organization_id = project.organization_id
     and member.user_id = v_actor_user_id
    where project.id = p_project_id;
  end if;

  if v_organization_id is null then
    return jsonb_build_object(
      'accessState',
      case
        when v_is_internal then 'project_not_found'
        else 'not_found_or_denied'
      end,
      'origins', '[]'::jsonb,
      'hasMore', false
    );
  end if;

  if not v_is_internal
    and not public.has_org_permission(v_organization_id, 'retention.view') then
    return jsonb_build_object(
      'accessState', 'permission_denied',
      'origins', '[]'::jsonb,
      'hasMore', false
    );
  end if;

  select coalesce(capability.enabled, false)
  into v_capability_enabled
  from public.organization_capabilities capability
  where capability.organization_id = v_organization_id
    and capability.capability_key = 'retention_management';

  select coalesce(state.mode, 'legacy')
  into v_mode
  from public.project_retention_workflow_states state
  where state.organization_id = v_organization_id
    and state.project_id = p_project_id;

  v_access_state := case
    when v_is_internal then 'internal_diagnostics'
    when not v_capability_enabled then 'capability_disabled'
    when v_mode = 'observe' then 'available'
    when v_mode = 'legacy' then 'legacy_mode'
    else 'inactive_mode'
  end;

  if not v_is_internal and (not v_capability_enabled or v_mode <> 'observe') then
    return jsonb_build_object(
      'organizationId', v_organization_id,
      'projectId', p_project_id,
      'capabilityEnabled', v_capability_enabled,
      'workflowMode', v_mode,
      'accessState', v_access_state,
      'origins', '[]'::jsonb,
      'hasMore', false
    );
  end if;

  with ordered_claims as (
    select
      claim.*,
      row_number() over (
        order by
          claim.claim_date asc nulls last,
          claim.created_at asc,
          claim.id asc
      )::integer as chronological_sequence,
      round(
        sum(
          case
            when claim.status <> 'Cancelled'
              then coalesce(claim.retention_withheld_amount, 0)
                   - coalesce(claim.retention_released_amount, 0)
            else 0
          end
        ) over (
          order by
            claim.claim_date asc nulls last,
            claim.created_at asc,
            claim.id asc
          rows between unbounded preceding and current row
        ),
        2
      ) as expected_cumulative_balance
    from public.project_claims claim
    where claim.organization_id = v_organization_id
      and claim.project_id = p_project_id
  ),
  classified_claims as (
    select
      claim.*,
      array_remove(array[
        case
          when claim.retention_balance < 0
            then 'negative_claim_retention_balance'
        end,
        case
          when claim.status <> 'Cancelled'
            and claim.expected_cumulative_balance < 0
            then 'legacy_release_exceeds_held_at_sequence'
        end,
        case
          when round(claim.retention_balance, 2)
            <> claim.expected_cumulative_balance
            then 'cumulative_snapshot_mismatch'
        end,
        case
          when claim.status = 'Cancelled'
            and (
              claim.retention_withheld_amount <> 0
              or claim.retention_released_amount <> 0
            )
            then 'cancelled_claim_has_retention_movement'
        end,
        case
          when claim.claim_date is null then 'missing_claim_date'
        end,
        case
          when claim.status not in (
            'Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled'
          ) then 'unexpected_claim_status'
        end,
        case
          when claim.retention_percent is null
            or claim.retention_withheld_amount is null
            or claim.retention_released_amount is null
            or claim.retention_held_to_date is null
            or claim.retention_released_to_date is null
            or claim.retention_balance is null
            or claim.claim_amount is null
            or claim.net_claim_excl_gst is null
            or claim.gst_amount is null
            or claim.total_payable is null
            then 'unexpected_null_financial_field'
        end
      ], null)::text[] as diagnostic_codes
    from ordered_claims claim
  ),
  filtered_claims as (
    select claim.*
    from classified_claims claim
    where
      (
        p_statuses is null
        or cardinality(p_statuses) = 0
        or claim.status = any(p_statuses)
      )
      and (
        p_positive_retention is null
        or (claim.retention_withheld_amount > 0) = p_positive_retention
      )
      and (
        p_legacy_release is null
        or (claim.retention_released_amount <> 0) = p_legacy_release
      )
      and (
        p_diagnostic_codes is null
        or cardinality(p_diagnostic_codes) = 0
        or claim.diagnostic_codes && p_diagnostic_codes
      )
      and (
        p_after_claim_id is null
        or (
          p_after_claim_date is not null
          and (
            claim.claim_date > p_after_claim_date
            or claim.claim_date is null
            or (
              claim.claim_date = p_after_claim_date
              and (
                claim.created_at > p_after_created_at
                or (
                  claim.created_at = p_after_created_at
                  and claim.id > p_after_claim_id
                )
              )
            )
          )
        )
        or (
          p_after_claim_date is null
          and claim.claim_date is null
          and (
            claim.created_at > p_after_created_at
            or (
              claim.created_at = p_after_created_at
              and claim.id > p_after_claim_id
            )
          )
        )
      )
    order by
      claim.claim_date asc nulls last,
      claim.created_at asc,
      claim.id asc
    limit v_page_size + 1
  ),
  page_rows as (
    select *
    from filtered_claims
    order by
      claim_date asc nulls last,
      created_at asc,
      id asc
    limit v_page_size
  ),
  page_metadata as (
    select
      (select count(*) > v_page_size from filtered_claims) as has_more,
      (
        select jsonb_build_object(
          'claimDate', last_row.claim_date,
          'createdAt', last_row.created_at,
          'paymentClaimId', last_row.id
        )
        from (
          select *
          from page_rows
          order by
            claim_date desc nulls first,
            created_at desc,
            id desc
          limit 1
        ) last_row
      ) as next_cursor
  )
  select jsonb_build_object(
    'organizationId', v_organization_id,
    'projectId', p_project_id,
    'capabilityEnabled', v_capability_enabled,
    'workflowMode', v_mode,
    'accessState', v_access_state,
    'pageSize', v_page_size,
    'hasMore', page_metadata.has_more,
    'nextCursor',
      case when page_metadata.has_more then page_metadata.next_cursor else null end,
    'origins',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'organizationId', claim.organization_id,
              'projectId', claim.project_id,
              'paymentClaimId', claim.id,
              'claimNumber', claim.claim_number,
              'claimDate', claim.claim_date,
              'dueDate', claim.due_date,
              'status', claim.status,
              'createdAt', claim.created_at,
              'updatedAt', claim.updated_at,
              'chronologicalSequence', claim.chronological_sequence,
              'retentionMethod', claim.retention_method,
              'retentionRate', claim.retention_percent,
              'retentionScaleBands', claim.retention_scale_bands,
              'retentionWithheldAmount', claim.retention_withheld_amount,
              'retentionReleasedAmount', claim.retention_released_amount,
              'retentionHeldToDate', claim.retention_held_to_date,
              'retentionReleasedToDate', claim.retention_released_to_date,
              'retentionBalance', claim.retention_balance,
              'grossClaimAmount', claim.claim_amount,
              'netClaimExcludingGst', claim.net_claim_excl_gst,
              'gstAmount', claim.gst_amount,
              'totalPayable', claim.total_payable,
              'originatedPositiveRetention',
                claim.retention_withheld_amount > 0,
              'originatedRetentionAmount',
                greatest(claim.retention_withheld_amount, 0),
              'cancelled', claim.status = 'Cancelled',
              'containsLegacyRelease',
                claim.retention_released_amount <> 0,
              'negativeRetentionBalance',
                claim.retention_balance < 0,
              'internallyInconsistent',
                cardinality(claim.diagnostic_codes) > 0,
              'eligibleForFutureRetentionAnalysis',
                v_capability_enabled
                and v_mode = 'observe'
                and claim.status <> 'Cancelled'
                and claim.retention_withheld_amount > 0,
              'movementDerivedCumulativeBalance',
                claim.expected_cumulative_balance,
              'diagnostics',
                coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'code', code,
                        'severity',
                          case
                            when code in (
                              'negative_claim_retention_balance',
                              'legacy_release_exceeds_held_at_sequence',
                              'cumulative_snapshot_mismatch',
                              'unexpected_claim_status',
                              'unexpected_null_financial_field'
                            ) then 'blocking_for_future_cutover'
                            when code = 'cancelled_claim_has_retention_movement'
                              then 'warning'
                            else 'info'
                          end
                      )
                      order by code
                    )
                    from unnest(claim.diagnostic_codes) code
                  ),
                  '[]'::jsonb
                )
            )
            order by claim.chronological_sequence
          )
          from page_rows claim
        ),
        '[]'::jsonb
      )
  )
  into v_result
  from page_metadata;

  return v_result;
end;
$$;

revoke all on function public.get_project_retention_position_summary(uuid)
  from public, anon;
grant execute on function public.get_project_retention_position_summary(uuid)
  to authenticated, service_role;

revoke all on function public.get_project_retention_position_page(
  uuid, integer, date, timestamptz, uuid, text[], boolean, boolean, text[]
) from public, anon;
grant execute on function public.get_project_retention_position_page(
  uuid, integer, date, timestamptz, uuid, text[], boolean, boolean, text[]
) to authenticated, service_role;

commit;
