-- REVIEWED ROLLBACK SCRIPT — DO NOT RUN DURING THE STAGE 2 VERIFICATION GATE.
--
-- Preconditions:
--   1. Revert the Stage 2 application readers in the same controlled release.
--   2. Confirm rollout controls, lifecycle rows, and promotion events are empty.
--   3. Rerun the Stage 0 census and stop on any unknown lifecycle shape.
--
-- This removes only the additive Stage 2 compatibility readers and guards.
-- It does not modify Opportunity, Project, quote, document, task, commercial,
-- Xero, lifecycle, promotion-event, or rollout-control records.

begin;

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
    end if;
  end loop;
end;
$$;

drop trigger if exists enforce_delivery_project_delete_v1
on public.organization_projects;

-- Restore the exact pre-Stage 2 quote-precedence readers used by claims and
-- retention. These definitions come from 20260418235500 and 20260419153000.
create or replace function public.get_project_claim_base_quote_total(
  p_organization_id uuid,
  p_project_id uuid
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.calculate_project_quote_pre_gst_total(
        q.subtotal,
        q.margin_percent,
        q.discount_amount,
        q.contingency_amount
      )
      from public.project_quotes q
      where q.organization_id = p_organization_id
        and q.project_id = p_project_id
      order by
        case
          when q.status = 'Accepted' then 0
          when q.status = 'Sent' then 1
          else 2
        end,
        q.updated_at desc
      limit 1
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
security definer
set search_path = public
as $$
  select coalesce(
    (
      select round(coalesce(q.retention_percent_default, 0), 3)
      from public.project_quotes q
      where q.organization_id = p_organization_id
        and q.project_id = p_project_id
      order by
        case
          when q.status = 'Accepted' then 0
          when q.status = 'Sent' then 1
          else 2
        end,
        q.updated_at desc
      limit 1
    ),
    0
  );
$$;

drop function if exists public.enforce_delivery_project_delete_v1();
drop function if exists public.enforce_delivery_project_mutation_v1();
drop function if exists public.is_project_delivery_eligible_v1(uuid, uuid);
drop function if exists public.get_visible_project_ids_v1(uuid, uuid[]);
drop function if exists public.resolve_project_contractual_baseline_v1(uuid, uuid);
drop function if exists public.resolve_project_lifecycle_v1(uuid, uuid);
drop function if exists public.classify_opportunity_lifecycle_v1(uuid, uuid);

commit;
