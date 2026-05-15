begin;

create or replace function public.resolve_mobile_project_member_context_v2(
  p_project_id uuid
)
returns table (
  organization_id uuid,
  organization_member_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  project_org_id uuid;
  current_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select p.organization_id
  into project_org_id
  from public.organization_projects p
  where p.id = p_project_id;

  if project_org_id is null then
    raise exception 'Project not found';
  end if;

  select m.id
  into current_member_id
  from public.organization_members m
  where m.organization_id = project_org_id
    and m.user_id = auth.uid()
  limit 1;

  if current_member_id is null then
    raise exception 'Not authorized for this project';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.organization_id = project_org_id
      and pm.project_id = p_project_id
      and pm.organization_member_id = current_member_id
      and pm.is_active = true
  ) then
    raise exception 'You do not have active access to this project';
  end if;

  return query
  select project_org_id, current_member_id;
end;
$$;

create or replace function public.list_mobile_project_purchase_orders_v2(
  p_project_id uuid
)
returns table (
  purchase_order_id uuid,
  project_id uuid,
  purchase_order_number text,
  purchase_order_title text,
  status text,
  origin text,
  requested_by text,
  requested_date date,
  due_date date,
  notes text,
  issued_to_label text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  current_context record;
begin
  select *
  into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  return query
  select
    po.id as purchase_order_id,
    po.project_id,
    po.purchase_order_number,
    po.purchase_order_title,
    po.status,
    po.origin,
    po.requested_by,
    po.requested_date,
    po.due_date,
    po.notes,
    po.issued_to_label,
    po.created_at,
    po.updated_at
  from public.project_purchase_orders po
  where po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
  order by po.created_at desc;
end;
$$;

create or replace function public.get_mobile_project_purchase_order_detail_v2(
  p_project_id uuid,
  p_purchase_order_id uuid
)
returns table (
  purchase_order_id uuid,
  project_id uuid,
  purchase_order_number text,
  purchase_order_title text,
  status text,
  origin text,
  requested_by text,
  requested_date date,
  due_date date,
  notes text,
  issued_to_label text,
  supplier_contact text,
  supplier_name_snapshot text,
  supplier_email_snapshot text,
  supplier_phone_snapshot text,
  subtotal numeric,
  gst_total numeric,
  total_purchase_order_price numeric,
  line_items jsonb,
  attachments jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  current_context record;
begin
  select *
  into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not exists (
    select 1
    from public.project_purchase_orders po
    where po.organization_id = current_context.organization_id
      and po.project_id = p_project_id
      and po.id = p_purchase_order_id
  ) then
    raise exception 'Purchase order not found for this project';
  end if;

  return query
  select
    po.id as purchase_order_id,
    po.project_id,
    po.purchase_order_number,
    po.purchase_order_title,
    po.status,
    po.origin,
    po.requested_by,
    po.requested_date,
    po.due_date,
    po.notes,
    po.issued_to_label,
    po.supplier_contact,
    po.supplier_name_snapshot,
    po.supplier_email_snapshot,
    po.supplier_phone_snapshot,
    po.subtotal,
    po.gst_total,
    po.total_purchase_order_price,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'section', li.section,
            'description', li.description,
            'quantity', li.quantity,
            'unit', li.unit,
            'rate', li.rate,
            'total', li.total,
            'sort_order', li.sort_order
          )
          order by li.sort_order asc, li.created_at asc
        )
        from public.project_purchase_order_line_items li
        where li.organization_id = current_context.organization_id
          and li.project_id = p_project_id
          and li.purchase_order_id = po.id
      ),
      '[]'::jsonb
    ) as line_items,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', att.id,
            'file_name', att.file_name,
            'file_kind', att.file_kind,
            'notes', att.notes,
            'has_file', att.storage_path is not null,
            'has_external_url', public.is_safe_mobile_https_url(att.external_url),
            'created_at', att.created_at
          )
          order by att.created_at asc
        )
        from public.project_purchase_order_attachments att
        where att.organization_id = current_context.organization_id
          and att.project_id = p_project_id
          and att.purchase_order_id = po.id
      ),
      '[]'::jsonb
    ) as attachments,
    po.created_at,
    po.updated_at
  from public.project_purchase_orders po
  where po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
    and po.id = p_purchase_order_id
  limit 1;
end;
$$;

grant execute on function public.list_mobile_project_purchase_orders_v2(uuid) to authenticated;
grant execute on function public.get_mobile_project_purchase_order_detail_v2(uuid, uuid) to authenticated;

commit;
