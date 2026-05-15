begin;

create table if not exists public.purchase_order_activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete cascade,
  actor_user_id uuid null references auth.users (id) on delete set null,
  event_type text not null,
  field_name text null,
  old_value jsonb null,
  new_value jsonb null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint purchase_order_activity_log_event_type_not_blank check (char_length(trim(event_type)) > 0),
  constraint purchase_order_activity_log_summary_not_blank check (char_length(trim(summary)) > 0),
  constraint purchase_order_activity_log_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint purchase_order_activity_log_old_value_valid_check check (
    old_value is null
    or jsonb_typeof(old_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint purchase_order_activity_log_new_value_valid_check check (
    new_value is null
    or jsonb_typeof(new_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  )
);

create index if not exists purchase_order_activity_log_po_created_idx
  on public.purchase_order_activity_log (purchase_order_id, created_at desc);

create index if not exists purchase_order_activity_log_org_project_created_idx
  on public.purchase_order_activity_log (organization_id, project_id, created_at desc);

create index if not exists purchase_order_activity_log_org_event_type_created_idx
  on public.purchase_order_activity_log (organization_id, event_type, created_at desc);

alter table public.purchase_order_activity_log enable row level security;
alter table public.purchase_order_activity_log force row level security;

drop policy if exists "Members can view purchase order activity log" on public.purchase_order_activity_log;
create policy "Members can view purchase order activity log"
on public.purchase_order_activity_log
for select
to authenticated
using (
  public.is_member_of_organization(purchase_order_activity_log.organization_id)
);

revoke all on public.purchase_order_activity_log from public, anon, authenticated;
grant select on public.purchase_order_activity_log to authenticated;

drop function if exists public._write_purchase_order_activity(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  jsonb
);

create or replace function public._write_purchase_order_activity(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_field_name text,
  p_old_value jsonb,
  p_new_value jsonb,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_purchase_orders po
    where po.id = p_purchase_order_id
      and po.organization_id = p_organization_id
      and po.project_id = p_project_id
  ) then
    raise exception 'Purchase order not found for activity log write';
  end if;

  insert into public.purchase_order_activity_log (
    organization_id,
    project_id,
    purchase_order_id,
    actor_user_id,
    event_type,
    field_name,
    old_value,
    new_value,
    summary,
    metadata
  ) values (
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    p_actor_user_id,
    p_event_type,
    p_field_name,
    p_old_value,
    p_new_value,
    p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public._write_purchase_order_activity(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  jsonb
) from public, anon, authenticated;

create or replace function public.update_purchase_order_status(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_status text
)
returns table (
  id uuid,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_purchase_orders%rowtype;
  updated_row public.project_purchase_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if p_status not in ('Draft', 'Pending Approval', 'Approved', 'Issued', 'Received', 'Invoiced', 'Cancelled') then
    raise exception 'Purchase order status must be Draft, Pending Approval, Approved, Issued, Received, Invoiced, or Cancelled';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  select *
  into existing_row
  from public.project_purchase_orders po
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Purchase order not found';
  end if;

  if existing_row.status is not distinct from p_status then
    return query
    select existing_row.id, existing_row.status, existing_row.updated_at;
    return;
  end if;

  update public.project_purchase_orders po
  set status = p_status
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  returning * into updated_row;

  insert into public.project_purchase_order_status_events (
    organization_id,
    project_id,
    purchase_order_id,
    from_status,
    to_status,
    changed_by
  ) values (
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    existing_row.status,
    updated_row.status,
    auth.uid()
  );

  perform public._write_purchase_order_activity(
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    auth.uid(),
    'status_changed',
    'status',
    to_jsonb(existing_row.status),
    to_jsonb(updated_row.status),
    format('Status changed from %s to %s', existing_row.status, updated_row.status),
    jsonb_build_object('source', 'update_purchase_order_status_rpc')
  );

  return query
  select updated_row.id, updated_row.status, updated_row.updated_at;
end;
$$;

grant execute on function public.update_purchase_order_status(uuid, uuid, uuid, text) to authenticated;

commit;
