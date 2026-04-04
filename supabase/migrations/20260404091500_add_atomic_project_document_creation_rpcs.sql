create table if not exists public.project_document_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  document_kind text not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint project_document_counters_kind_check check (document_kind in ('variation', 'purchase_order')),
  constraint project_document_counters_pk primary key (project_id, document_kind)
);

create index if not exists project_document_counters_org_idx
  on public.project_document_counters (organization_id, project_id, document_kind);

drop trigger if exists set_project_document_counters_updated_at on public.project_document_counters;
create trigger set_project_document_counters_updated_at
before update on public.project_document_counters
for each row execute function public.set_updated_at();

alter table public.project_document_counters enable row level security;
alter table public.project_document_counters force row level security;

create or replace function public.next_project_document_number(
  p_organization_id uuid,
  p_project_id uuid,
  p_document_kind text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  if p_document_kind not in ('variation', 'purchase_order') then
    raise exception 'Unsupported document kind: %', p_document_kind;
  end if;

  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_project_id::text || ':' || p_document_kind));

  insert into public.project_document_counters (
    organization_id,
    project_id,
    document_kind,
    last_number
  )
  values (
    p_organization_id,
    p_project_id,
    p_document_kind,
    1
  )
  on conflict (project_id, document_kind)
  do update
    set last_number = public.project_document_counters.last_number + 1,
        updated_at = now()
  returning last_number
  into next_number;

  return next_number;
end;
$$;

create or replace function public.generate_project_variation_number(
  p_organization_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_code text;
  next_sequence integer;
begin
  select coalesce(
           nullif(btrim(project_code), ''),
           nullif(regexp_replace(upper(coalesce(slug, '')), '[^A-Z0-9]+', '-', 'g'), ''),
           'JOB'
         )
    into resolved_project_code
  from public.organization_projects
  where id = p_project_id
    and organization_id = p_organization_id;

  if resolved_project_code is null then
    raise exception 'Could not resolve project code for variation numbering';
  end if;

  next_sequence := public.next_project_document_number(p_organization_id, p_project_id, 'variation');

  return format('%s-VAR-%s', resolved_project_code, lpad(next_sequence::text, 2, '0'));
end;
$$;

create or replace function public.assign_project_variation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.variation_number is null or btrim(new.variation_number) = '' then
    new.variation_number := public.generate_project_variation_number(new.organization_id, new.project_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_project_variations_variation_number on public.project_variations;
create trigger set_project_variations_variation_number
before insert on public.project_variations
for each row
execute function public.assign_project_variation_number();

create or replace function public.generate_project_purchase_order_number(
  p_organization_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_code text;
  next_sequence integer;
begin
  select coalesce(
           nullif(btrim(project_code), ''),
           nullif(regexp_replace(upper(coalesce(slug, '')), '[^A-Z0-9]+', '-', 'g'), ''),
           'JOB'
         )
    into resolved_project_code
  from public.organization_projects
  where id = p_project_id
    and organization_id = p_organization_id;

  if resolved_project_code is null then
    raise exception 'Could not resolve project code for purchase order numbering';
  end if;

  next_sequence := public.next_project_document_number(p_organization_id, p_project_id, 'purchase_order');

  return format('%s-PO-%s', resolved_project_code, lpad(next_sequence::text, 2, '0'));
end;
$$;

create or replace function public.assign_project_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purchase_order_number is null or btrim(new.purchase_order_number) = '' then
    new.purchase_order_number := public.generate_project_purchase_order_number(new.organization_id, new.project_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_project_purchase_orders_purchase_order_number on public.project_purchase_orders;
create trigger set_project_purchase_orders_purchase_order_number
before insert on public.project_purchase_orders
for each row
execute function public.assign_project_purchase_order_number();

create or replace function public.create_project_variation_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_title text default 'New Variation'
)
returns table (
  id uuid,
  variation_number text,
  variation_title text,
  status text,
  origin text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.project_variations%rowtype;
  resolved_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  resolved_title := coalesce(nullif(btrim(p_title), ''), 'New Variation');

  insert into public.project_variations (
    organization_id,
    project_id,
    created_by,
    variation_title,
    variation_number,
    status,
    origin,
    source_reference,
    requested_by
  ) values (
    p_organization_id,
    p_project_id,
    auth.uid(),
    resolved_title,
    '',
    'Draft',
    'Unknown',
    '',
    ''
  )
  returning * into created_row;

  return query
  select created_row.id, created_row.variation_number, created_row.variation_title, created_row.status, created_row.origin;
end;
$$;

create or replace function public.create_project_purchase_order_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_title text default 'New Purchase Order',
  p_origin text default 'Material Supply'
)
returns table (
  id uuid,
  purchase_order_number text,
  purchase_order_title text,
  status text,
  origin text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.project_purchase_orders%rowtype;
  resolved_title text;
  resolved_origin text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  resolved_title := coalesce(nullif(btrim(p_title), ''), 'New Purchase Order');
  resolved_origin := case
    when p_origin in ('Material Supply', 'Subcontract Work', 'Plant / Equipment Hire', 'Site Expense', 'Freight / Delivery', 'Variation Order', 'General Purchase', 'Other')
      then p_origin
    else 'Material Supply'
  end;

  insert into public.project_purchase_orders (
    organization_id,
    project_id,
    created_by,
    purchase_order_title,
    purchase_order_number,
    status,
    origin,
    requested_by
  ) values (
    p_organization_id,
    p_project_id,
    auth.uid(),
    resolved_title,
    '',
    'Draft',
    resolved_origin,
    ''
  )
  returning * into created_row;

  return query
  select created_row.id, created_row.purchase_order_number, created_row.purchase_order_title, created_row.status, created_row.origin;
end;
$$;

grant execute on function public.next_project_document_number(uuid, uuid, text) to authenticated;
grant execute on function public.generate_project_variation_number(uuid, uuid) to authenticated;
grant execute on function public.generate_project_purchase_order_number(uuid, uuid) to authenticated;
grant execute on function public.create_project_variation_draft(uuid, uuid, text) to authenticated;
grant execute on function public.create_project_purchase_order_draft(uuid, uuid, text, text) to authenticated;
