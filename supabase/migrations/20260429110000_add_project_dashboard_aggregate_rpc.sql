create or replace function public.get_project_dashboard_aggregate(
  p_organization_id uuid,
  p_project_slug text,
  p_now timestamptz,
  p_today date,
  p_start_of_day timestamptz,
  p_end_of_day timestamptz,
  p_month_start date,
  p_month_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  select
    p.id,
    p.name,
    p.stage,
    p.location,
    p.created_at,
    coalesce(c.name, 'Unassigned') as client_name
  into v_project
  from public.organization_projects p
  left join public.organization_clients c
    on c.id = p.client_id
   and c.organization_id = p.organization_id
  where p.organization_id = p_organization_id
    and p.slug = p_project_slug;

  if v_project.id is null then
    raise exception 'Project not found';
  end if;

  with
  todo_rows as (
    select id, title, status, due_at, due_date, updated_at
    from public.project_job_todos
    where organization_id = p_organization_id
      and project_id = v_project.id
      and status <> 'Done'
      and status <> 'Archived'
  ),
  issue_rows as (
    select id, title, status, updated_at
    from public.project_quality_issues
    where organization_id = p_organization_id
      and project_id = v_project.id
    order by updated_at desc
  ),
  variation_summary_rows as (
    select status, total_variation_price
    from public.project_variations
    where organization_id = p_organization_id
      and project_id = v_project.id
    limit 200
  ),
  variation_feed_rows as (
    select id, variation_number, status, updated_at
    from public.project_variations
    where organization_id = p_organization_id
      and project_id = v_project.id
    order by updated_at desc
    limit 6
  ),
  claim_summary_rows as (
    select status, claim_amount, paid_amount
    from public.project_claims
    where organization_id = p_organization_id
      and project_id = v_project.id
    limit 200
  ),
  claim_feed_rows as (
    select id, claim_number, status, updated_at
    from public.project_claims
    where organization_id = p_organization_id
      and project_id = v_project.id
    order by updated_at desc
    limit 6
  ),
  po_summary_rows as (
    select status, total_purchase_order_price
    from public.project_purchase_orders
    where organization_id = p_organization_id
      and project_id = v_project.id
    limit 200
  ),
  signoff_rows as (
    select id, title, status, updated_at
    from public.project_quality_sign_offs
    where organization_id = p_organization_id
      and project_id = v_project.id
    order by updated_at desc
    limit 200
  ),
  latest_quote as (
    select total_quote_price
    from public.project_quotes
    where organization_id = p_organization_id
      and project_id = v_project.id
    order by updated_at desc
    limit 1
  ),
  time_event_feed as (
    select id, event_type, message, created_at
    from public.project_time_sheet_events
    where organization_id = p_organization_id
      and project_id = v_project.id
    order by created_at desc
    limit 6
  )
  select jsonb_build_object(
    'project', jsonb_build_object(
      'projectId', v_project.id,
      'projectName', v_project.name,
      'stage', v_project.stage,
      'location', v_project.location,
      'createdAt', v_project.created_at,
      'clientName', v_project.client_name
    ),
    'metrics', jsonb_build_object(
      'overdueTasks', (
        select count(*)
        from todo_rows t
        where (t.due_at is not null and t.due_at < p_now)
           or (t.due_at is null and t.due_date is not null and t.due_date < p_today)
      ),
      'tasksDueToday', (
        select count(*)
        from todo_rows t
        where (t.due_at is not null and t.due_at >= p_start_of_day and t.due_at < p_end_of_day)
           or (t.due_at is null and t.due_date = p_today)
      ),
      'openIssues', (
        select count(*)
        from issue_rows i
        where i.status in ('Open', 'In Progress', 'Blocked', 'Requires Attention')
      ),
      'failedInspections', (
        select count(*)
        from public.project_quality_inspection_items pii
        where pii.organization_id = p_organization_id
          and pii.project_id = v_project.id
          and pii.status = 'fail'
      ),
      'awaitingVariationApproval', (
        select count(*)
        from public.project_variations v
        where v.organization_id = p_organization_id
          and v.project_id = v_project.id
          and v.status in ('Sent', 'Client Review')
      ),
      'pendingVariations', (
        select count(*)
        from public.project_variations v
        where v.organization_id = p_organization_id
          and v.project_id = v_project.id
          and v.status in ('Sent', 'Client Review')
      ),
      'claimReadyToSend', (
        select count(*)
        from public.project_claims c
        where c.organization_id = p_organization_id
          and c.project_id = v_project.id
          and c.status = 'Draft'
          and c.claim_amount > 0
      ),
      'claimsThisMonth', (
        select count(*)
        from public.project_claims c
        where c.organization_id = p_organization_id
          and c.project_id = v_project.id
          and c.claim_date >= p_month_start
          and c.claim_date < p_month_end
      ),
      'activeWorkers', (
        select count(*)
        from public.project_time_sheet_entries e
        where e.organization_id = p_organization_id
          and e.project_id = v_project.id
          and e.clock_in_at is not null
          and e.clock_out_at is null
      ),
      'pendingSignoffs', (
        select count(*)
        from signoff_rows s
        where s.status in ('Pending', 'Requested')
      ),
      'inspectionsToday', (
        select count(*)
        from public.project_quality_inspections i
        where i.organization_id = p_organization_id
          and i.project_id = v_project.id
          and i.scheduled_at >= p_start_of_day
          and i.scheduled_at < p_end_of_day
      )
    ),
    'financials', jsonb_build_object(
      'quoteValue', coalesce((select total_quote_price from latest_quote), 0),
      'variationTotal', (
        select coalesce(sum(coalesce(v.total_variation_price, 0)), 0)
        from variation_summary_rows v
      ),
      'claimsSubmitted', (
        select count(*)
        from claim_summary_rows c
        where c.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
      ),
      'claimsPaidAmount', (
        select coalesce(sum(coalesce(c.paid_amount, 0)), 0)
        from claim_summary_rows c
      ),
      'claimsUnpaidAmount', (
        select coalesce(sum(greatest(coalesce(c.claim_amount, 0) - coalesce(c.paid_amount, 0), 0)), 0)
        from claim_summary_rows c
      ),
      'poOutstandingCount', (
        select count(*)
        from po_summary_rows p
        where p.status not in ('Invoiced', 'Cancelled', 'Received')
      ),
      'poOutstandingAmount', (
        select coalesce(sum(coalesce(p.total_purchase_order_price, 0)), 0)
        from po_summary_rows p
        where p.status not in ('Invoiced', 'Cancelled', 'Received')
      )
    ),
    'feeds', jsonb_build_object(
      'tasks', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', t.id,
            'title', t.title,
            'status', t.status,
            'updated_at', t.updated_at
          ) order by t.updated_at desc),
          '[]'::jsonb
        )
        from (
          select id, title, status, updated_at
          from todo_rows
          order by updated_at desc
          limit 6
        ) t
      ),
      'issues', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', i.id,
            'title', i.title,
            'status', i.status,
            'updated_at', i.updated_at
          ) order by i.updated_at desc),
          '[]'::jsonb
        )
        from (
          select id, title, status, updated_at
          from issue_rows
          limit 6
        ) i
      ),
      'variations', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', v.id,
            'variation_number', v.variation_number,
            'status', v.status,
            'updated_at', v.updated_at
          ) order by v.updated_at desc),
          '[]'::jsonb
        )
        from variation_feed_rows v
      ),
      'claims', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', c.id,
            'claim_number', c.claim_number,
            'status', c.status,
            'updated_at', c.updated_at
          ) order by c.updated_at desc),
          '[]'::jsonb
        )
        from claim_feed_rows c
      ),
      'time_events', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', e.id,
            'event_type', e.event_type,
            'message', e.message,
            'created_at', e.created_at
          ) order by e.created_at desc),
          '[]'::jsonb
        )
        from time_event_feed e
      ),
      'signoffs', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', s.id,
            'title', s.title,
            'status', s.status,
            'updated_at', s.updated_at
          ) order by s.updated_at desc),
          '[]'::jsonb
        )
        from (
          select id, title, status, updated_at
          from signoff_rows
          limit 6
        ) s
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_project_dashboard_aggregate(
  uuid,
  text,
  timestamptz,
  date,
  timestamptz,
  timestamptz,
  date,
  date
) to authenticated;
