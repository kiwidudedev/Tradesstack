alter table public.project_actual_cost_events
  add column if not exists event_type text,
  add column if not exists reverses_event_id uuid null,
  add column if not exists correction_root_event_id uuid null,
  add column if not exists reversal_reason text null,
  add column if not exists reversal_note text null;

update public.project_actual_cost_events
set event_type = coalesce(event_type, 'posting'),
    correction_root_event_id = coalesce(correction_root_event_id, id)
where event_type is null
   or correction_root_event_id is null;

alter table public.project_actual_cost_events
  alter column event_type set default 'posting',
  alter column event_type set not null;

create or replace function public.set_project_actual_cost_event_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.event_type is null or btrim(new.event_type) = '' then
    new.event_type := 'posting';
  end if;

  if new.correction_root_event_id is null then
    new.correction_root_event_id := new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_project_actual_cost_event_defaults
  on public.project_actual_cost_events;

create trigger set_project_actual_cost_event_defaults
before insert on public.project_actual_cost_events
for each row
execute function public.set_project_actual_cost_event_defaults();

alter table public.project_actual_cost_events
  drop constraint if exists project_actual_cost_events_amount_check,
  drop constraint if exists project_actual_cost_events_tax_amount_check,
  drop constraint if exists project_actual_cost_events_total_amount_check,
  drop constraint if exists project_actual_cost_events_quantity_check,
  drop constraint if exists project_actual_cost_events_event_type_check,
  drop constraint if exists project_actual_cost_events_reversal_reference_check,
  drop constraint if exists project_actual_cost_events_reverses_event_id_fkey,
  drop constraint if exists project_actual_cost_events_correction_root_event_id_fkey;

alter table public.project_actual_cost_events
  add constraint project_actual_cost_events_event_type_check
    check (event_type in ('posting', 'reversal')),
  add constraint project_actual_cost_events_reversal_reference_check
    check (
      (event_type = 'posting' and reverses_event_id is null)
      or
      (event_type = 'reversal' and reverses_event_id is not null)
    ),
  add constraint project_actual_cost_events_reverses_event_id_fkey
    foreign key (reverses_event_id)
    references public.project_actual_cost_events (id)
    on delete set null,
  add constraint project_actual_cost_events_correction_root_event_id_fkey
    foreign key (correction_root_event_id)
    references public.project_actual_cost_events (id)
    on delete set null;

drop index if exists public.project_actual_cost_events_allocation_uidx;

create unique index if not exists project_actual_cost_events_posting_allocation_uidx
  on public.project_actual_cost_events (supplier_invoice_line_allocation_id)
  where supplier_invoice_line_allocation_id is not null
    and event_type = 'posting';

create unique index if not exists project_actual_cost_events_reversal_once_uidx
  on public.project_actual_cost_events (reverses_event_id)
  where reverses_event_id is not null
    and event_type = 'reversal';

create index if not exists project_actual_cost_events_correction_root_idx
  on public.project_actual_cost_events (correction_root_event_id, created_at asc)
  where correction_root_event_id is not null;

create index if not exists project_actual_cost_events_reverses_event_idx
  on public.project_actual_cost_events (reverses_event_id)
  where reverses_event_id is not null;

alter table public.supplier_invoice_line_allocations
  add column if not exists allocation_group_id uuid,
  add column if not exists supersedes_allocation_id uuid null,
  add column if not exists edit_state text;

alter table public.supplier_invoice_line_allocations
  disable trigger prepare_supplier_invoice_line_allocation_review_transition;

update public.supplier_invoice_line_allocations allocation
set allocation_group_id = allocation.id
where allocation_group_id is null;

update public.supplier_invoice_line_allocations allocation
set edit_state = case
  when exists (
    select 1
    from public.project_actual_cost_events event
    where (
      event.supplier_invoice_line_allocation_id = allocation.id
      or event.source_invoice_allocation_id = allocation.id
    )
      and event.event_status = 'posted'
  ) then 'locked_posted'
  else 'editable'
end
where edit_state is null;

alter table public.supplier_invoice_line_allocations
  enable trigger prepare_supplier_invoice_line_allocation_review_transition;

create or replace function public.set_supplier_invoice_line_allocation_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.allocation_group_id is null then
    new.allocation_group_id := new.id;
  end if;

  if new.edit_state is null or btrim(new.edit_state) = '' then
    new.edit_state := 'editable';
  end if;

  return new;
end;
$$;

drop trigger if exists set_supplier_invoice_line_allocation_defaults
  on public.supplier_invoice_line_allocations;

create trigger set_supplier_invoice_line_allocation_defaults
before insert on public.supplier_invoice_line_allocations
for each row
execute function public.set_supplier_invoice_line_allocation_defaults();

alter table public.supplier_invoice_line_allocations
  alter column allocation_group_id set not null,
  alter column edit_state set default 'editable',
  alter column edit_state set not null,
  drop constraint if exists supplier_invoice_line_allocations_edit_state_check,
  drop constraint if exists supplier_invoice_line_allocations_supersedes_allocation_id_fkey;

alter table public.supplier_invoice_line_allocations
  add constraint supplier_invoice_line_allocations_edit_state_check
    check (edit_state in ('editable', 'locked_posted', 'reversed', 'superseded')),
  add constraint supplier_invoice_line_allocations_supersedes_allocation_id_fkey
    foreign key (supersedes_allocation_id)
    references public.supplier_invoice_line_allocations (id)
    on delete set null;

create index if not exists supplier_invoice_line_allocations_group_idx
  on public.supplier_invoice_line_allocations (allocation_group_id, created_at asc);

create index if not exists supplier_invoice_line_allocations_supersedes_idx
  on public.supplier_invoice_line_allocations (supersedes_allocation_id)
  where supersedes_allocation_id is not null;

create index if not exists supplier_invoice_line_allocations_edit_state_idx
  on public.supplier_invoice_line_allocations (organization_id, edit_state, created_at desc);

insert into public.app_permissions (permission_key, description)
values
  ('actual_costs.reverse', 'Reverse posted actual cost events and start correction workflows')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'actual_costs.reverse', true),
  ('admin', 'actual_costs.reverse', true),
  ('qs', 'actual_costs.reverse', true),
  ('project_manager', 'actual_costs.reverse', false),
  ('worker', 'actual_costs.reverse', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

create or replace function public.has_org_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  has_explicit_allow boolean := false;
  has_explicit_deny boolean := false;
  has_role_allow boolean := false;
  has_fallback_allow boolean := false;
begin
  if auth.uid() is null or p_organization_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    return false;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.member_permission_overrides o
      on o.organization_member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and o.permission_key = p_permission_key
      and o.is_allowed = true
  )
  into has_explicit_allow;

  if has_explicit_allow then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.member_permission_overrides o
      on o.organization_member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and o.permission_key = p_permission_key
      and o.is_allowed = false
  )
  into has_explicit_deny;

  if has_explicit_deny then
    return false;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp
      on rp.role = m.role
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and rp.permission_key = p_permission_key
      and rp.is_allowed = true
  )
  into has_role_allow;

  if has_role_allow then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and (
        (p_permission_key = 'settings.organization.update' and m.role in ('owner', 'admin'))
        or
        (p_permission_key = 'leads.clients.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'leads.opportunities.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'quotes.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'variations.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'purchase_orders.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'suppliers.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'supplier_invoices.view' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'supplier_invoices.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'supplier_invoices.review' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'actual_costs.reverse' and m.role in ('owner', 'admin', 'qs'))
      )
  )
  into has_fallback_allow;

  return has_fallback_allow;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;
