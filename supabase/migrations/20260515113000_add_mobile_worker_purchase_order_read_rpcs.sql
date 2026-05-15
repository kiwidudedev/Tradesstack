begin;

create or replace function public.resolve_mobile_worker_project_context(
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

create or replace function public.is_mobile_worker_assigned_purchase_order(
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_organization_member_id uuid
)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1
    from public.project_purchase_order_assignments a
    join public.project_purchase_orders po
      on po.id = a.purchase_order_id
    where a.project_id = p_project_id
      and a.purchase_order_id = p_purchase_order_id
      and a.organization_member_id = p_organization_member_id
      and a.is_active = true
      and po.project_id = p_project_id
  );
$$;

create or replace function public.is_safe_mobile_https_url(
  p_url text
)
returns boolean
language sql
immutable
as $$
  select
    p_url is not null
    and char_length(btrim(p_url)) > 0
    and btrim(p_url) ~* '^https://';
$$;

create or replace function public.list_mobile_worker_project_purchase_orders(
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
as $$
declare
  current_context record;
begin
  select *
  into current_context
  from public.resolve_mobile_worker_project_context(p_project_id);

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
  from public.project_purchase_order_assignments a
  join public.project_purchase_orders po
    on po.id = a.purchase_order_id
  where a.organization_id = current_context.organization_id
    and a.project_id = p_project_id
    and a.organization_member_id = current_context.organization_member_id
    and a.is_active = true
    and po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
  order by po.created_at desc;
end;
$$;

create or replace function public.get_mobile_worker_project_purchase_order_detail(
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
as $$
declare
  current_context record;
begin
  select *
  into current_context
  from public.resolve_mobile_worker_project_context(p_project_id);

  if not public.is_mobile_worker_assigned_purchase_order(
    p_project_id,
    p_purchase_order_id,
    current_context.organization_member_id
  ) then
    raise exception 'Purchase order not found or not assigned to the current worker';
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

create or replace function public.get_mobile_worker_purchase_order_attachment_url(
  p_project_id uuid,
  p_attachment_id uuid
)
returns table (
  attachment_id uuid,
  purchase_order_id uuid,
  file_name text,
  file_kind text,
  url text,
  expires_at timestamptz,
  source text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_context record;
  attachment_row public.project_purchase_order_attachments%rowtype;
begin
  select *
  into current_context
  from public.resolve_mobile_worker_project_context(p_project_id);

  select att.*
  into attachment_row
  from public.project_purchase_order_attachments att
  join public.project_purchase_orders po
    on po.id = att.purchase_order_id
  where att.id = p_attachment_id
    and att.organization_id = current_context.organization_id
    and att.project_id = p_project_id
    and po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
    and public.is_mobile_worker_assigned_purchase_order(
      p_project_id,
      att.purchase_order_id,
      current_context.organization_member_id
    )
  limit 1;

  if attachment_row.id is null then
    raise exception 'Attachment not found or not assigned to the current worker';
  end if;

  if attachment_row.storage_path is not null then
    raise exception 'Storage-backed attachment URLs are not available from this SQL contract';
  end if;

  if not public.is_safe_mobile_https_url(attachment_row.external_url) then
    raise exception 'Attachment URL is unavailable or uses an unsupported scheme';
  end if;

  return query
  select
    attachment_row.id as attachment_id,
    attachment_row.purchase_order_id,
    attachment_row.file_name,
    attachment_row.file_kind,
    btrim(attachment_row.external_url) as url,
    null::timestamptz as expires_at,
    'external_url'::text as source;
end;
$$;

grant execute on function public.list_mobile_worker_project_purchase_orders(uuid) to authenticated;
grant execute on function public.get_mobile_worker_project_purchase_order_detail(uuid, uuid) to authenticated;
grant execute on function public.get_mobile_worker_purchase_order_attachment_url(uuid, uuid) to authenticated;

commit;
