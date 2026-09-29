-- Approval-gated one-record reconciliation. This is intentionally not a migration.
-- Run only after 20260802120000_correct_promoted_project_metadata.sql is deployed
-- and the hosted correction receives separate approval.

begin;

do $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  project_row public.organization_projects%rowtype;
begin
  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = '167a3b5b-c6f3-4e82-b054-3595d0f7e2d3'::uuid
  for update;

  select * into project_row
  from public.organization_projects project
  where project.id = 'a0f2bec6-1c9d-4438-a898-41a4d67c2f17'::uuid
    and project.organization_id = opportunity_row.organization_id
  for update;

  if opportunity_row.name <> 'Bucklands Beach Reno'
    or opportunity_row.slug <> 'bucklands-beach-reno'
    or opportunity_row.workspace_project_id is distinct from project_row.id
    or opportunity_row.converted_project_id is distinct from project_row.id
    or project_row.source_opportunity_id is distinct from opportunity_row.id
    or project_row.name <> 'Bucklands Beach Reno Tender Workspace'
    or project_row.slug <> 'bucklands-beach-reno-tender'
    or project_row.project_code <> '26030'
    or not exists (
      select 1 from public.opportunity_lifecycles lifecycle
      where lifecycle.organization_id = opportunity_row.organization_id
        and lifecycle.opportunity_id = opportunity_row.id
        and lifecycle.original_workspace_project_id = project_row.id
        and lifecycle.strategy = 'promote_workspace_v1'
        and lifecycle.strategy_version = 1
    )
    or not exists (
      select 1 from public.opportunity_final_projects final_project
      where final_project.organization_id = opportunity_row.organization_id
        and final_project.opportunity_id = opportunity_row.id
        and final_project.project_id = project_row.id
    )
    or not exists (
      select 1 from public.opportunity_promotion_events event
      where event.organization_id = opportunity_row.organization_id
        and event.opportunity_id = opportunity_row.id
        and event.project_id = project_row.id
        and event.strategy = 'promote_workspace_v1'
    )
  then
    raise exception 'Bucklands reconciliation guard failed; no changes applied'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1 from public.organization_projects other_project
    where other_project.organization_id = project_row.organization_id
      and other_project.id <> project_row.id
      and lower(other_project.slug) = 'bucklands-beach-reno'
  ) or exists (
    select 1 from public.organization_project_slug_aliases alias
    where alias.organization_id = project_row.organization_id
      and alias.project_id <> project_row.id
      and lower(alias.alias_slug) = 'bucklands-beach-reno'
  ) then
    raise exception 'Bucklands canonical slug is no longer available; no changes applied'
      using errcode = '23505';
  end if;

  insert into public.organization_project_slug_aliases (
    organization_id, project_id, alias_slug, created_by, reason
  ) values (
    project_row.organization_id,
    project_row.id,
    project_row.slug,
    null,
    'approved_existing_promotion_reconciliation'
  );

  -- This hosted trigger currently fails every Project update because its
  -- function has ambiguous organization_id/project_id references. Metadata
  -- changes do not affect supplier-bill dependency identity, so suppress only
  -- that trigger for this update and restore it before leaving the transaction.
  alter table public.organization_projects
    disable trigger enqueue_supplier_bill_ucl_refresh;

  update public.organization_projects project
  set name = opportunity_row.name,
      slug = opportunity_row.slug
  where project.id = project_row.id
    and project.organization_id = project_row.organization_id;

  alter table public.organization_projects
    enable trigger enqueue_supplier_bill_ucl_refresh;

  if not exists (
    select 1 from public.organization_projects verified
    where verified.id = project_row.id
      and verified.organization_id = project_row.organization_id
      and verified.name = 'Bucklands Beach Reno'
      and verified.slug = 'bucklands-beach-reno'
      and verified.project_code = '26030'
      and verified.source_opportunity_id = opportunity_row.id
  ) then
    raise exception 'Bucklands post-update identity verification failed'
      using errcode = 'TS409';
  end if;
end;
$$;

commit;
