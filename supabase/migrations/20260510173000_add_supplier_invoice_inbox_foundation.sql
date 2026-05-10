begin;

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  invoice_number text not null default '',
  invoice_date date null,
  due_date date null,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  currency text not null default 'NZD',
  status text not null default 'Captured',
  source text not null default 'manual',
  document_file_path text null,
  document_file_name text null,
  document_mime_type text null,
  document_size_bytes bigint null,
  notes text not null default '',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoices_status_check
    check (status in ('Captured', 'Needs Review', 'Approved', 'Disputed')),
  constraint supplier_invoices_source_check
    check (source in ('upload', 'manual')),
  constraint supplier_invoices_currency_not_blank
    check (char_length(trim(currency)) > 0)
);

create index if not exists supplier_invoices_org_created_idx
  on public.supplier_invoices (organization_id, created_at desc);

create index if not exists supplier_invoices_org_status_idx
  on public.supplier_invoices (organization_id, status, created_at desc);

create index if not exists supplier_invoices_org_supplier_idx
  on public.supplier_invoices (organization_id, supplier_id)
  where supplier_id is not null;

drop trigger if exists set_supplier_invoices_updated_at on public.supplier_invoices;
create trigger set_supplier_invoices_updated_at
before update on public.supplier_invoices
for each row execute function public.set_updated_at();

create or replace function public.enforce_supplier_invoice_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('Approved', 'Disputed') then
    if not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
      raise exception 'You do not have permission to review supplier invoices.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_supplier_invoice_review_transition on public.supplier_invoices;
create trigger enforce_supplier_invoice_review_transition
before insert or update on public.supplier_invoices
for each row execute function public.enforce_supplier_invoice_review_transition();

create table if not exists public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  description text not null default '',
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  cost_code_id uuid null references public.organization_cost_codes (id) on delete set null,
  project_id uuid null references public.organization_projects (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_invoice_lines_invoice_idx
  on public.supplier_invoice_lines (supplier_invoice_id, sort_order, created_at);

create index if not exists supplier_invoice_lines_org_project_idx
  on public.supplier_invoice_lines (organization_id, project_id)
  where project_id is not null;

drop trigger if exists set_supplier_invoice_lines_updated_at on public.supplier_invoice_lines;
create trigger set_supplier_invoice_lines_updated_at
before update on public.supplier_invoice_lines
for each row execute function public.set_updated_at();

create table if not exists public.supplier_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text null,
  size_bytes bigint null,
  document_type text not null default 'invoice',
  uploaded_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_invoice_documents_document_type_check
    check (document_type in ('invoice', 'credit_note', 'supporting_document')),
  constraint supplier_invoice_documents_file_name_not_blank
    check (char_length(trim(file_name)) > 0),
  constraint supplier_invoice_documents_file_path_not_blank
    check (char_length(trim(file_path)) > 0)
);

create index if not exists supplier_invoice_documents_invoice_idx
  on public.supplier_invoice_documents (supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_documents_org_idx
  on public.supplier_invoice_documents (organization_id, created_at desc);

alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoices force row level security;
alter table public.supplier_invoice_lines enable row level security;
alter table public.supplier_invoice_lines force row level security;
alter table public.supplier_invoice_documents enable row level security;
alter table public.supplier_invoice_documents force row level security;

drop policy if exists "Privileged members can view supplier invoices" on public.supplier_invoices;
create policy "Privileged members can view supplier invoices"
on public.supplier_invoices
for select
to authenticated
using (
  public.has_org_permission(supplier_invoices.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoices" on public.supplier_invoices;
create policy "Privileged members can create supplier invoices"
on public.supplier_invoices
for insert
to authenticated
with check (
  supplier_invoices.created_by = auth.uid()
  and public.has_org_permission(supplier_invoices.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can update supplier invoices" on public.supplier_invoices;
create policy "Privileged members can update supplier invoices"
on public.supplier_invoices
for update
to authenticated
using (
  public.has_org_permission(supplier_invoices.organization_id, 'supplier_invoices.write')
)
with check (
  public.has_org_permission(supplier_invoices.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can delete supplier invoices" on public.supplier_invoices;
create policy "Privileged members can delete supplier invoices"
on public.supplier_invoices
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoices.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can view supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can view supplier invoice lines"
on public.supplier_invoice_lines
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_lines.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can create supplier invoice lines"
on public.supplier_invoice_lines
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_lines.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can update supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can update supplier invoice lines"
on public.supplier_invoice_lines
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_lines.organization_id, 'supplier_invoices.write')
)
with check (
  public.has_org_permission(supplier_invoice_lines.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can delete supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can delete supplier invoice lines"
on public.supplier_invoice_lines
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_lines.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can view supplier invoice documents" on public.supplier_invoice_documents;
create policy "Privileged members can view supplier invoice documents"
on public.supplier_invoice_documents
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_documents.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice documents" on public.supplier_invoice_documents;
create policy "Privileged members can create supplier invoice documents"
on public.supplier_invoice_documents
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_documents.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can delete supplier invoice documents" on public.supplier_invoice_documents;
create policy "Privileged members can delete supplier invoice documents"
on public.supplier_invoice_documents
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_documents.organization_id, 'supplier_invoices.write')
);

grant select, insert, update, delete on public.supplier_invoices to authenticated;
grant select, insert, update, delete on public.supplier_invoice_lines to authenticated;
grant select, insert, delete on public.supplier_invoice_documents to authenticated;

insert into public.app_permissions (permission_key, description)
values
  ('supplier_invoices.view', 'View supplier invoices and invoice documents'),
  ('supplier_invoices.write', 'Create, update, and manage supplier invoices'),
  ('supplier_invoices.review', 'Review and approve supplier invoices')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'supplier_invoices.view', true),
  ('admin', 'supplier_invoices.view', true),
  ('qs', 'supplier_invoices.view', true),
  ('project_manager', 'supplier_invoices.view', true),
  ('worker', 'supplier_invoices.view', false),
  ('owner', 'supplier_invoices.write', true),
  ('admin', 'supplier_invoices.write', true),
  ('qs', 'supplier_invoices.write', true),
  ('project_manager', 'supplier_invoices.write', true),
  ('worker', 'supplier_invoices.write', false),
  ('owner', 'supplier_invoices.review', true),
  ('admin', 'supplier_invoices.review', true),
  ('qs', 'supplier_invoices.review', true),
  ('project_manager', 'supplier_invoices.review', true),
  ('worker', 'supplier_invoices.review', false)
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
      )
  )
  into has_fallback_allow;

  return has_fallback_allow;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-invoice-documents',
  'supplier-invoice-documents',
  false,
  26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_supplier_invoice_document_storage_object(
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
    from public.supplier_invoices si
    where char_length(coalesce(object_path, '')) > 0
      and array_length(string_to_array(object_path, '/'), 1) >= 4
      and split_part(object_path, '/', 1) = si.organization_id::text
      and split_part(object_path, '/', 2) = 'supplier-invoices'
      and split_part(object_path, '/', 3) = si.id::text
      and public.has_org_permission(si.organization_id, p_permission_key)
  );
$$;

grant execute on function public.can_access_supplier_invoice_document_storage_object(text, text) to authenticated;

drop policy if exists "Members can read supplier invoice document storage objects" on storage.objects;
create policy "Members can read supplier invoice document storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'supplier-invoice-documents'
  and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.view')
);

drop policy if exists "Members can upload supplier invoice document storage objects" on storage.objects;
create policy "Members can upload supplier invoice document storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'supplier-invoice-documents'
  and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write')
);

drop policy if exists "Members can update supplier invoice document storage objects" on storage.objects;
create policy "Members can update supplier invoice document storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'supplier-invoice-documents'
  and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write')
)
with check (
  bucket_id = 'supplier-invoice-documents'
  and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write')
);

drop policy if exists "Members can delete supplier invoice document storage objects" on storage.objects;
create policy "Members can delete supplier invoice document storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'supplier-invoice-documents'
  and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write')
);

commit;
