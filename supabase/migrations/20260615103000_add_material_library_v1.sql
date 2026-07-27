begin;

create table if not exists public.organization_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid null references auth.users (id) on delete set null,
  name text not null,
  normalized_name text not null,
  description text null,
  default_unit text not null default '',
  category text null,
  organization_cost_code_id uuid null references public.organization_cost_codes (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  archived_at timestamptz null,
  archived_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_materials_name_not_blank check (char_length(trim(name)) > 0),
  constraint organization_materials_normalized_name_not_blank check (char_length(trim(normalized_name)) > 0),
  constraint organization_materials_default_unit_not_blank check (char_length(trim(default_unit)) > 0)
);

create unique index if not exists organization_materials_org_normalized_name_key
  on public.organization_materials (organization_id, normalized_name);

create index if not exists organization_materials_org_active_updated_idx
  on public.organization_materials (organization_id, is_active, updated_at desc);

create index if not exists organization_materials_org_cost_code_idx
  on public.organization_materials (organization_id, organization_cost_code_id)
  where organization_cost_code_id is not null;

drop trigger if exists set_organization_materials_updated_at on public.organization_materials;
create trigger set_organization_materials_updated_at
before update on public.organization_materials
for each row execute function public.set_updated_at();

create table if not exists public.organization_material_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  uploaded_by uuid null references auth.users (id) on delete set null,
  file_name text not null,
  file_type text not null,
  storage_path text null,
  status text not null default 'uploaded',
  rows_extracted integer not null default 0,
  rows_approved integer not null default 0,
  rows_rejected integer not null default 0,
  extraction_method text null,
  extraction_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_import_batches_file_name_not_blank check (char_length(trim(file_name)) > 0),
  constraint organization_material_import_batches_file_type_not_blank check (char_length(trim(file_type)) > 0),
  constraint organization_material_import_batches_status_check check (
    status in ('uploaded', 'extracting', 'ready_for_review', 'partially_approved', 'approved', 'failed', 'cancelled')
  ),
  constraint organization_material_import_batches_counter_check check (
    rows_extracted >= 0 and rows_approved >= 0 and rows_rejected >= 0
  )
);

create index if not exists organization_material_import_batches_org_status_created_idx
  on public.organization_material_import_batches (organization_id, status, created_at desc);

create index if not exists organization_material_import_batches_org_supplier_idx
  on public.organization_material_import_batches (organization_id, supplier_id, created_at desc)
  where supplier_id is not null;

drop trigger if exists set_organization_material_import_batches_updated_at on public.organization_material_import_batches;
create trigger set_organization_material_import_batches_updated_at
before update on public.organization_material_import_batches
for each row execute function public.set_updated_at();

create table if not exists public.organization_material_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_batch_id uuid not null references public.organization_material_import_batches (id) on delete cascade,
  row_index integer not null default 0,
  extracted_name text null,
  extracted_description text null,
  extracted_unit text null,
  extracted_unit_cost numeric(14,4) null,
  extracted_currency text null,
  supplier_description text null,
  supplier_sku text null,
  matched_material_id uuid null references public.organization_materials (id) on delete set null,
  action text not null default 'pending',
  status text not null default 'pending_review',
  confidence numeric(5,4) null,
  reviewed_name text null,
  reviewed_description text null,
  reviewed_unit text null,
  reviewed_unit_cost numeric(14,4) null,
  reviewed_currency text null,
  reviewed_supplier_description text null,
  reviewed_supplier_sku text null,
  reviewed_by uuid null references auth.users (id) on delete set null,
  reviewed_at timestamptz null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_import_rows_action_check check (
    action in ('pending', 'create_material', 'match_material', 'skip')
  ),
  constraint organization_material_import_rows_status_check check (
    status in ('pending_review', 'approved', 'rejected', 'error')
  ),
  constraint organization_material_import_rows_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint organization_material_import_rows_unit_cost_check check (
    extracted_unit_cost is null or extracted_unit_cost >= 0
  ),
  constraint organization_material_import_rows_reviewed_unit_cost_check check (
    reviewed_unit_cost is null or reviewed_unit_cost >= 0
  )
);

create index if not exists organization_material_import_rows_batch_status_idx
  on public.organization_material_import_rows (import_batch_id, status, row_index);

create index if not exists organization_material_import_rows_org_material_idx
  on public.organization_material_import_rows (organization_id, matched_material_id, status)
  where matched_material_id is not null;

drop trigger if exists set_organization_material_import_rows_updated_at on public.organization_material_import_rows;
create trigger set_organization_material_import_rows_updated_at
before update on public.organization_material_import_rows
for each row execute function public.set_updated_at();

create table if not exists public.organization_material_supplier_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  material_id uuid not null references public.organization_materials (id) on delete cascade,
  supplier_id uuid not null references public.organization_suppliers (id) on delete cascade,
  import_batch_id uuid null references public.organization_material_import_batches (id) on delete set null,
  supplier_sku text null,
  supplier_description text null,
  unit text not null,
  unit_cost numeric(14,4) not null,
  currency text not null default 'NZD',
  is_preferred boolean not null default false,
  is_current boolean not null default true,
  source text not null default 'manual',
  effective_from timestamptz not null default now(),
  effective_to timestamptz null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_supplier_prices_unit_not_blank check (char_length(trim(unit)) > 0),
  constraint organization_material_supplier_prices_currency_not_blank check (char_length(trim(currency)) > 0),
  constraint organization_material_supplier_prices_source_check check (
    source in ('manual', 'import', 'supplier_invoice', 'purchase_order', 'api')
  ),
  constraint organization_material_supplier_prices_unit_cost_check check (unit_cost >= 0),
  constraint organization_material_supplier_prices_effective_window_check check (
    effective_to is null or effective_to >= effective_from
  )
);

create unique index if not exists organization_material_supplier_prices_current_key
  on public.organization_material_supplier_prices (material_id, supplier_id, unit)
  where is_current = true;

create unique index if not exists organization_material_supplier_prices_preferred_key
  on public.organization_material_supplier_prices (material_id)
  where is_current = true and is_preferred = true;

create index if not exists organization_material_supplier_prices_org_material_current_idx
  on public.organization_material_supplier_prices (organization_id, material_id, is_current, updated_at desc);

create index if not exists organization_material_supplier_prices_org_supplier_current_idx
  on public.organization_material_supplier_prices (organization_id, supplier_id, is_current, updated_at desc);

drop trigger if exists set_organization_material_supplier_prices_updated_at on public.organization_material_supplier_prices;
create trigger set_organization_material_supplier_prices_updated_at
before update on public.organization_material_supplier_prices
for each row execute function public.set_updated_at();

alter table public.organization_materials enable row level security;
alter table public.organization_materials force row level security;
alter table public.organization_material_import_batches enable row level security;
alter table public.organization_material_import_batches force row level security;
alter table public.organization_material_import_rows enable row level security;
alter table public.organization_material_import_rows force row level security;
alter table public.organization_material_supplier_prices enable row level security;
alter table public.organization_material_supplier_prices force row level security;

drop policy if exists "Members can view organization materials" on public.organization_materials;
create policy "Members can view organization materials"
on public.organization_materials
for select
to authenticated
using (public.has_org_permission(organization_materials.organization_id, 'materials.view'));

drop policy if exists "Privileged members can create organization materials" on public.organization_materials;
create policy "Privileged members can create organization materials"
on public.organization_materials
for insert
to authenticated
with check (public.has_org_permission(organization_materials.organization_id, 'materials.write'));

drop policy if exists "Privileged members can update organization materials" on public.organization_materials;
create policy "Privileged members can update organization materials"
on public.organization_materials
for update
to authenticated
using (public.has_org_permission(organization_materials.organization_id, 'materials.write'))
with check (public.has_org_permission(organization_materials.organization_id, 'materials.write'));

drop policy if exists "Privileged members can delete organization materials" on public.organization_materials;
create policy "Privileged members can delete organization materials"
on public.organization_materials
for delete
to authenticated
using (public.has_org_permission(organization_materials.organization_id, 'materials.write'));

drop policy if exists "Members can view material import batches" on public.organization_material_import_batches;
create policy "Members can view material import batches"
on public.organization_material_import_batches
for select
to authenticated
using (public.has_org_permission(organization_material_import_batches.organization_id, 'materials.view'));

drop policy if exists "Privileged members can create material import batches" on public.organization_material_import_batches;
create policy "Privileged members can create material import batches"
on public.organization_material_import_batches
for insert
to authenticated
with check (public.has_org_permission(organization_material_import_batches.organization_id, 'materials.write'));

drop policy if exists "Privileged members can update material import batches" on public.organization_material_import_batches;
create policy "Privileged members can update material import batches"
on public.organization_material_import_batches
for update
to authenticated
using (public.has_org_permission(organization_material_import_batches.organization_id, 'materials.write'))
with check (public.has_org_permission(organization_material_import_batches.organization_id, 'materials.write'));

drop policy if exists "Members can view material import rows" on public.organization_material_import_rows;
create policy "Members can view material import rows"
on public.organization_material_import_rows
for select
to authenticated
using (public.has_org_permission(organization_material_import_rows.organization_id, 'materials.view'));

drop policy if exists "Privileged members can create material import rows" on public.organization_material_import_rows;
create policy "Privileged members can create material import rows"
on public.organization_material_import_rows
for insert
to authenticated
with check (public.has_org_permission(organization_material_import_rows.organization_id, 'materials.write'));

drop policy if exists "Privileged members can update material import rows" on public.organization_material_import_rows;
create policy "Privileged members can update material import rows"
on public.organization_material_import_rows
for update
to authenticated
using (public.has_org_permission(organization_material_import_rows.organization_id, 'materials.write'))
with check (public.has_org_permission(organization_material_import_rows.organization_id, 'materials.write'));

drop policy if exists "Privileged members can delete material import rows" on public.organization_material_import_rows;
create policy "Privileged members can delete material import rows"
on public.organization_material_import_rows
for delete
to authenticated
using (public.has_org_permission(organization_material_import_rows.organization_id, 'materials.write'));

drop policy if exists "Members can view material supplier prices" on public.organization_material_supplier_prices;
create policy "Members can view material supplier prices"
on public.organization_material_supplier_prices
for select
to authenticated
using (public.has_org_permission(organization_material_supplier_prices.organization_id, 'materials.view'));

drop policy if exists "Privileged members can create material supplier prices" on public.organization_material_supplier_prices;
create policy "Privileged members can create material supplier prices"
on public.organization_material_supplier_prices
for insert
to authenticated
with check (public.has_org_permission(organization_material_supplier_prices.organization_id, 'materials.write'));

drop policy if exists "Privileged members can update material supplier prices" on public.organization_material_supplier_prices;
create policy "Privileged members can update material supplier prices"
on public.organization_material_supplier_prices
for update
to authenticated
using (public.has_org_permission(organization_material_supplier_prices.organization_id, 'materials.write'))
with check (public.has_org_permission(organization_material_supplier_prices.organization_id, 'materials.write'));

drop policy if exists "Privileged members can delete material supplier prices" on public.organization_material_supplier_prices;
create policy "Privileged members can delete material supplier prices"
on public.organization_material_supplier_prices
for delete
to authenticated
using (public.has_org_permission(organization_material_supplier_prices.organization_id, 'materials.write'));

grant select, insert, update, delete on public.organization_materials to authenticated;
grant select, insert, update, delete on public.organization_material_import_batches to authenticated;
grant select, insert, update, delete on public.organization_material_import_rows to authenticated;
grant select, insert, update, delete on public.organization_material_supplier_prices to authenticated;

insert into public.app_permissions (permission_key, description)
values
  ('materials.view', 'View company material library and import review batches'),
  ('materials.write', 'Create, update, archive, import, and manage company materials')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'materials.view', true),
  ('admin', 'materials.view', true),
  ('qs', 'materials.view', true),
  ('project_manager', 'materials.view', true),
  ('worker', 'materials.view', false),
  ('owner', 'materials.write', true),
  ('admin', 'materials.write', true),
  ('qs', 'materials.write', true),
  ('project_manager', 'materials.write', true),
  ('worker', 'materials.write', false)
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
        (p_permission_key = 'materials.view' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'materials.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
      )
  )
  into has_fallback_allow;

  return has_fallback_allow;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-library-imports',
  'material-library-imports',
  false,
  26214400,
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_material_import_storage_object(
  object_path text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_material_import_batches batch
    where char_length(coalesce(object_path, '')) > 0
      and array_length(string_to_array(object_path, '/'), 1) >= 4
      and split_part(object_path, '/', 1) = batch.organization_id::text
      and split_part(object_path, '/', 2) = 'material-imports'
      and split_part(object_path, '/', 3) = batch.id::text
      and public.has_org_permission(batch.organization_id, p_permission_key)
  );
$$;

grant execute on function public.can_access_material_import_storage_object(text, text) to authenticated;

drop policy if exists "Members can read material import storage objects" on storage.objects;
create policy "Members can read material import storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'material-library-imports'
  and public.can_access_material_import_storage_object(name, 'materials.view')
);

drop policy if exists "Members can upload material import storage objects" on storage.objects;
create policy "Members can upload material import storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'material-library-imports'
  and public.can_access_material_import_storage_object(name, 'materials.write')
);

drop policy if exists "Members can update material import storage objects" on storage.objects;
create policy "Members can update material import storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'material-library-imports'
  and public.can_access_material_import_storage_object(name, 'materials.write')
)
with check (
  bucket_id = 'material-library-imports'
  and public.can_access_material_import_storage_object(name, 'materials.write')
);

drop policy if exists "Members can delete material import storage objects" on storage.objects;
create policy "Members can delete material import storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'material-library-imports'
  and public.can_access_material_import_storage_object(name, 'materials.write')
);

commit;
