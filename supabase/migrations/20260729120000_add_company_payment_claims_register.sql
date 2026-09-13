begin;

create index if not exists project_claims_company_register_period_idx
  on public.project_claims (
    organization_id,
    period_end desc nulls last,
    claim_date desc nulls last,
    created_at desc,
    id desc
  );

create index if not exists project_claims_company_register_period_key_idx
  on public.project_claims (
    organization_id,
    (coalesce(period_end, claim_date)) desc,
    claim_date desc nulls last,
    created_at desc,
    id desc
  );

create index if not exists project_claims_company_register_project_status_idx
  on public.project_claims (organization_id, project_id, status);

create index if not exists organization_projects_company_register_client_idx
  on public.organization_projects (organization_id, client_id, id);

create or replace function public.get_company_payment_claims_register(
  p_organization_id uuid,
  p_month text default null,
  p_search text default null,
  p_project_id uuid default null,
  p_client_id uuid default null,
  p_claim_status text default null,
  p_xero_status text default null,
  p_external_status text default null,
  p_payment_status text default null,
  p_outstanding_only boolean default false,
  p_overdue_only boolean default false,
  p_attention_only boolean default false,
  p_sort text default 'period',
  p_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_currency text;
  v_month text;
  v_month_start date;
  v_next_month_start date;
  v_today date;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
  ) then
    raise exception 'Active organization membership is required' using errcode = '42501';
  end if;

  if not public.has_org_permission(
    p_organization_id,
    'accounting.sales_invoices.view'
  ) then
    raise exception 'Payment Claims register access is denied' using errcode = '42501';
  end if;

  select
    case
      when exists (
        select 1 from pg_timezone_names zone where zone.name = organization.timezone
      ) then organization.timezone
      else 'UTC'
    end,
    coalesce(
      nullif(upper(trim(to_jsonb(organization)->>'default_currency')), ''),
      'NZD'
    )
  into v_timezone, v_currency
  from public.organizations organization
  where organization.id = p_organization_id;

  if v_timezone is null then
    raise exception 'Organization not found' using errcode = '42501';
  end if;

  v_today := (now() at time zone v_timezone)::date;
  v_month := case
    when lower(coalesce(p_month, '')) = 'all' then 'all'
    when coalesce(p_month, '') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then p_month
    else to_char(v_today, 'YYYY-MM')
  end;
  if v_month <> 'all' then
    v_month_start := to_date(v_month || '-01', 'YYYY-MM-DD');
    v_next_month_start := (v_month_start + interval '1 month')::date;
  end if;

  with base as not materialized (
    select
      claim.id,
      claim.claim_number,
      claim.claim_title,
      claim.status as claim_status,
      claim.claim_date,
      claim.period_start,
      claim.period_end,
      claim.due_date as internal_due_date,
      claim.claim_amount,
      claim.retention_withheld_amount,
      claim.retention_released_amount,
      claim.net_claim_excl_gst,
      claim.gst_amount,
      claim.total_payable,
      claim.previous_claims_total,
      claim.created_at,
      project.id as project_id,
      project.slug as project_slug,
      project.project_code,
      project.name as project_name,
      client.id as client_id,
      coalesce(nullif(trim(client.company_name), ''), nullif(trim(client.name), ''))
        as client_name,
      document.id as accounting_document_id,
      coalesce(revision.external_document_number, document.external_document_number)
        as xero_invoice_number,
      coalesce(revision.external_document_id, document.external_document_id)
        as xero_invoice_id,
      coalesce(revision.currency_code, document.currency_code, v_currency) as currency,
      coalesce(
        nullif(revision.commercial_snapshot->>'invoiceDate', '')::date,
        claim.claim_date
      ) as invoice_date,
      coalesce(
        nullif(revision.commercial_snapshot->>'dueDate', '')::date,
        claim.due_date
      ) as effective_due_date,
      revision.subtotal_minor,
      revision.tax_minor,
      revision.total_minor,
      projection.projected_at,
      projection.divergent,
      case
        when projection.divergent then null
        else projection.amount_paid_minor
      end as trusted_paid_minor,
      case
        when projection.divergent then null
        else projection.amount_due_minor
      end as trusted_outstanding_minor,
      coalesce(
        projection.normalized_invoice_status,
        document.normalized_external_status
      ) as external_status,
      case
        when projection.divergent then 'attention_required'
        else projection.normalized_payment_status
      end as payment_status,
      case
        when document.id is null then 'not_exported'
        when projection.divergent
          or document.export_status in ('failed', 'attention_required')
          or revision.lifecycle_state = 'failed'
          or nullif(document.last_status_sync_error, '') is not null
          or (
            document.export_status = 'exported'
            and projection.id is null
          )
          then 'attention_required'
        when revision.lifecycle_state in ('queued', 'processing', 'succeeded', 'cancelled', 'superseded')
          then revision.lifecycle_state
        when document.export_status in ('queued', 'exporting', 'exported', 'cancelled')
          then document.export_status
        else coalesce(document.export_status, 'not_exported')
      end as xero_status,
      coalesce((
        projection.divergent
        or document.export_status in ('failed', 'attention_required')
        or revision.lifecycle_state = 'failed'
        or nullif(document.last_status_sync_error, '') is not null
        or (
          document.export_status = 'exported'
          and projection.id is null
        )
        or coalesce(
          projection.normalized_invoice_status,
          document.normalized_external_status
        ) in ('voided', 'deleted', 'unknown')
      ), false) as xero_attention,
      coalesce(claim.period_end, claim.claim_date) as period_key
    from public.project_claims claim
    join public.organization_projects project
      on project.id = claim.project_id
     and project.organization_id = claim.organization_id
    left join public.organization_clients client
      on client.id = project.client_id
     and client.organization_id = project.organization_id
    left join public.organization_xero_connections connection
      on connection.organization_id = claim.organization_id
    left join lateral (
      select candidate.*
      from public.organization_accounting_documents candidate
      where candidate.organization_id = claim.organization_id
        and candidate.provider = 'xero'
        and candidate.local_document_type = 'project_claim'
        and candidate.project_claim_id = claim.id
        and candidate.accounting_connection_id = connection.id
        and candidate.tenant_id = connection.tenant_id
      order by candidate.created_at desc, candidate.id desc
      limit 1
    ) document on true
    left join public.organization_accounting_document_revisions revision
      on revision.id = document.active_accounting_revision_id
     and revision.organization_id = document.organization_id
     and revision.accounting_document_id = document.id
     and revision.connection_id = document.accounting_connection_id
     and revision.tenant_id = document.tenant_id
    left join public.organization_accounting_projections projection
      on projection.id = document.current_accounting_projection_id
     and projection.organization_id = document.organization_id
     and projection.accounting_document_id = document.id
     and projection.accounting_revision_id = revision.id
    where claim.organization_id = p_organization_id
  ),
  filtered as materialized (
    select base.*
    from base
    where (
        v_month = 'all'
        or (
          base.period_key >= v_month_start
          and base.period_key < v_next_month_start
        )
      )
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or base.claim_number ilike '%' || trim(p_search) || '%'
        or base.claim_title ilike '%' || trim(p_search) || '%'
        or base.project_code ilike '%' || trim(p_search) || '%'
        or base.project_name ilike '%' || trim(p_search) || '%'
        or coalesce(base.client_name, '') ilike '%' || trim(p_search) || '%'
        or coalesce(base.xero_invoice_number, '') ilike '%' || trim(p_search) || '%'
      )
      and (p_project_id is null or base.project_id = p_project_id)
      and (p_client_id is null or base.client_id = p_client_id)
      and (nullif(p_claim_status, '') is null or base.claim_status = p_claim_status)
      and (nullif(p_xero_status, '') is null or base.xero_status = p_xero_status)
      and (
        nullif(p_external_status, '') is null
        or base.external_status = p_external_status
      )
      and (
        nullif(p_payment_status, '') is null
        or base.payment_status = p_payment_status
      )
      and (
        not coalesce(p_outstanding_only, false)
        or (
          base.trusted_outstanding_minor > 0
          and coalesce(base.external_status, '') not in ('voided', 'deleted')
        )
      )
      and (
        not coalesce(p_overdue_only, false)
        or (
          base.trusted_outstanding_minor > 0
          and base.effective_due_date < v_today
          and base.claim_status <> 'Cancelled'
          and coalesce(base.external_status, '') not in ('voided', 'deleted')
        )
      )
      and (not coalesce(p_attention_only, false) or base.xero_attention)
  ),
  ordered as (
    select filtered.*
    from filtered
    order by
      case when p_sort = 'claim_number' and p_direction = 'asc' then lower(claim_number) end asc,
      case when p_sort = 'claim_number' and p_direction = 'desc' then lower(claim_number) end desc,
      case when p_sort = 'due' and p_direction = 'asc' then effective_due_date end asc nulls last,
      case when p_sort = 'due' and p_direction = 'desc' then effective_due_date end desc nulls last,
      case when p_sort = 'amount' and p_direction = 'asc' then total_payable end asc,
      case when p_sort = 'amount' and p_direction = 'desc' then total_payable end desc,
      case when p_sort = 'period' and p_direction = 'asc' then period_end end asc nulls last,
      case when p_sort = 'period' and p_direction = 'desc' then period_end end desc nulls last,
      claim_date desc nulls last,
      created_at desc,
      id desc
    limit v_page_size
    offset (v_page - 1) * v_page_size
  ),
  metrics as (
    select
      coalesce(sum(total_payable) filter (where claim_status <> 'Cancelled'), 0)
        as amount_payable,
      coalesce(sum(trusted_paid_minor) filter (
        where claim_status <> 'Cancelled'
          and coalesce(external_status, '') not in ('voided', 'deleted')
      ), 0) as paid_minor,
      coalesce(sum(trusted_outstanding_minor) filter (
        where claim_status <> 'Cancelled'
          and coalesce(external_status, '') not in ('voided', 'deleted')
      ), 0) as outstanding_minor,
      count(*) filter (
        where claim_status <> 'Cancelled'
          and coalesce(external_status, '') not in ('voided', 'deleted')
          and (
            payment_status is distinct from 'paid'
            and (
              trusted_outstanding_minor > 0
              or (
                trusted_outstanding_minor is null
                and claim_status in ('Submitted', 'Unpaid', 'Overdue')
              )
            )
          )
      ) as open_claims,
      count(*) filter (where xero_attention) as xero_attention
    from filtered
  ),
  options as (
    select
      coalesce((
        select jsonb_agg(option order by option->>'label')
        from (
          select distinct jsonb_build_object(
            'value', project_id,
            'label', trim(concat(project_code, ' ', project_name))
          ) as option
          from base
        ) project_options
      ), '[]'::jsonb) as projects,
      coalesce((
        select jsonb_agg(option order by option->>'label')
        from (
          select distinct jsonb_build_object('value', client_id, 'label', client_name) as option
          from base
          where client_id is not null and client_name is not null
        ) client_options
      ), '[]'::jsonb) as clients,
      coalesce((
        select jsonb_agg(month_key order by month_key desc)
        from (
          select distinct to_char(period_key, 'YYYY-MM') as month_key
          from base
          where period_key is not null
        ) month_options
      ), '[]'::jsonb) as months
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(ordered) order by
        case when p_sort = 'claim_number' and p_direction = 'asc' then lower(claim_number) end asc,
        case when p_sort = 'claim_number' and p_direction = 'desc' then lower(claim_number) end desc,
        case when p_sort = 'due' and p_direction = 'asc' then effective_due_date end asc nulls last,
        case when p_sort = 'due' and p_direction = 'desc' then effective_due_date end desc nulls last,
        case when p_sort = 'amount' and p_direction = 'asc' then total_payable end asc,
        case when p_sort = 'amount' and p_direction = 'desc' then total_payable end desc,
        case when p_sort = 'period' and p_direction = 'asc' then period_end end asc nulls last,
        case when p_sort = 'period' and p_direction = 'desc' then period_end end desc nulls last,
        claim_date desc nulls last,
        created_at desc,
        id desc
      )
      from ordered
    ), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'amountPayable', metrics.amount_payable,
      'paid', metrics.paid_minor::numeric / 100,
      'outstanding', metrics.outstanding_minor::numeric / 100,
      'openClaims', metrics.open_claims,
      'xeroAttention', metrics.xero_attention
    ),
    'pageInfo', jsonb_build_object(
      'page', v_page,
      'pageSize', v_page_size,
      'totalRows', (select count(*) from filtered),
      'totalPages', greatest(ceil((select count(*) from filtered)::numeric / v_page_size), 1)
    ),
    'options', jsonb_build_object(
      'projects', options.projects,
      'clients', options.clients,
      'months', options.months
    ),
    'context', jsonb_build_object(
      'month', v_month,
      'timezone', v_timezone,
      'currency', v_currency,
      'localToday', v_today
    )
  )
  into v_result
  from metrics
  cross join options;

  return v_result;
end;
$$;

revoke all on function public.get_company_payment_claims_register(
  uuid, text, text, uuid, uuid, text, text, text, text,
  boolean, boolean, boolean, text, text, integer, integer
) from public, anon;

grant execute on function public.get_company_payment_claims_register(
  uuid, text, text, uuid, uuid, text, text, text, text,
  boolean, boolean, boolean, text, text, integer, integer
) to authenticated;

commit;
