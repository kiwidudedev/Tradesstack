begin;

drop function if exists public.update_purchase_order_status(uuid, uuid, uuid, text);

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

  return query
  select updated_row.id, updated_row.status, updated_row.updated_at;
end;
$$;

grant execute on function public.update_purchase_order_status(uuid, uuid, uuid, text) to authenticated;

commit;
