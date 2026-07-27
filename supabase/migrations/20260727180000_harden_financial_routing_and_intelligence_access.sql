-- Close the remaining public-schema advisory gaps without changing the
-- application-level accounting or intelligence workflows.
--
-- Access model:
--   * organization_tradesstack_accounting_mappings: organisation-member read;
--     writes remain behind the existing permission-checked service action.
--   * tradesstack_financial_routing_codes: authenticated global reference read;
--     maintenance remains service-only.
--   * cost_construction_intelligence_events / queue: service-only worker state.
--   * pricing worksheet observability: service-only platform-admin reporting.

alter table public.organization_tradesstack_accounting_mappings
  enable row level security;
alter table public.organization_tradesstack_accounting_mappings
  force row level security;

drop policy if exists "Organization members can view accounting mappings"
  on public.organization_tradesstack_accounting_mappings;
create policy "Organization members can view accounting mappings"
on public.organization_tradesstack_accounting_mappings
for select
to authenticated
using (
  public.is_member_of_organization(
    organization_tradesstack_accounting_mappings.organization_id
  )
);

revoke all on table public.organization_tradesstack_accounting_mappings
  from public, anon, authenticated;
grant select on table public.organization_tradesstack_accounting_mappings
  to authenticated;
grant select, insert, update, delete on table public.organization_tradesstack_accounting_mappings
  to service_role;

alter table public.tradesstack_financial_routing_codes
  enable row level security;
alter table public.tradesstack_financial_routing_codes
  force row level security;

drop policy if exists "Authenticated users can view financial routing codes"
  on public.tradesstack_financial_routing_codes;
create policy "Authenticated users can view financial routing codes"
on public.tradesstack_financial_routing_codes
for select
to authenticated
using ((select auth.role()) = 'authenticated');

revoke all on table public.tradesstack_financial_routing_codes
  from public, anon, authenticated;
grant select on table public.tradesstack_financial_routing_codes
  to authenticated;
grant select, insert, update, delete on table public.tradesstack_financial_routing_codes
  to service_role;

alter table public.cost_construction_intelligence_events
  enable row level security;
alter table public.cost_construction_intelligence_events
  force row level security;
revoke all on table public.cost_construction_intelligence_events
  from public, anon, authenticated;
grant select, insert, update, delete on table public.cost_construction_intelligence_events
  to service_role;

alter table public.cost_construction_intelligence_queue
  enable row level security;
alter table public.cost_construction_intelligence_queue
  force row level security;
revoke all on table public.cost_construction_intelligence_queue
  from public, anon, authenticated;
grant select, insert, update, delete on table public.cost_construction_intelligence_queue
  to service_role;

-- These SECURITY DEFINER functions are worker entry points. Their callers all
-- use the service client, so public execution is unnecessary and unsafe.
revoke all on function public.enqueue_cost_construction_intelligence_event(jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_cost_construction_intelligence_batch(integer, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_cost_construction_intelligence_batch(jsonb)
  from public, anon, authenticated;

grant execute on function public.enqueue_cost_construction_intelligence_event(jsonb)
  to service_role;
grant execute on function public.claim_cost_construction_intelligence_batch(integer, uuid, text, integer)
  to service_role;
grant execute on function public.finalize_cost_construction_intelligence_batch(jsonb)
  to service_role;

-- A later historical migration recreated this view and unintentionally removed
-- its security_invoker option. The only current consumer is the service-backed
-- platform-admin reporting path.
alter view public.intelligence_observability_pricing_worksheet_daily
  set (security_invoker = true);
revoke all on table public.intelligence_observability_pricing_worksheet_daily
  from public, anon, authenticated;
grant select on table public.intelligence_observability_pricing_worksheet_daily
  to service_role;
