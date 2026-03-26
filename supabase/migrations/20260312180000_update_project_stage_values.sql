-- Move stage values from legacy labels to:
-- Pricing, Construction, Completion

alter table public.organization_projects
drop constraint if exists organization_projects_stage_check;

alter table public.trade_pack_workspaces
drop constraint if exists trade_pack_workspaces_stage_check;

update public.organization_projects
set stage = case
  when stage in ('Planning', 'Estimating') then 'Pricing'
  when stage = 'In Delivery' then 'Construction'
  else stage
end;

update public.trade_pack_workspaces
set stage = case
  when stage in ('Planning', 'Estimating') then 'Pricing'
  when stage = 'In Delivery' then 'Construction'
  else stage
end;

alter table public.organization_projects
alter column stage set default 'Pricing';

alter table public.trade_pack_workspaces
alter column stage set default 'Pricing';

alter table public.organization_projects
add constraint organization_projects_stage_check
check (stage in ('Pricing', 'Construction', 'Completion'));

alter table public.trade_pack_workspaces
add constraint trade_pack_workspaces_stage_check
check (stage in ('Pricing', 'Construction', 'Completion'));
