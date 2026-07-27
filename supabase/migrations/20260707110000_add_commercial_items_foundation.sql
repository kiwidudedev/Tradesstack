create table if not exists public.commercial_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id uuid not null references public.organization_opportunities (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  source_type text not null default 'worksheet_selection',
  source_workbook_id uuid not null references public.opportunity_pricing_worksheets (id) on delete restrict,
  source_worksheet_id uuid not null references public.opportunity_pricing_worksheets (id) on delete restrict,
  source_sheet_id uuid not null references public.opportunity_pricing_workbook_sheets (id) on delete restrict,
  source_range text not null,
  source_signature text not null,
  source_version integer not null default 1,
  source_status text not null default 'current',
  stale_reason_code text null,
  last_source_checked_at timestamptz null,
  last_source_changed_at timestamptz null,
  description text not null default '',
  quantity numeric(14,3) null,
  unit text null,
  rate numeric(14,2) null,
  total numeric(14,2) null,
  snapshot_json jsonb not null default '{}'::jsonb,
  source_link_json jsonb not null default '{}'::jsonb,
  locked_metadata_json jsonb not null default '{}'::jsonb,
  ucl_classification text null,
  ucl_validation_status text not null default 'not_reviewed',
  created_by uuid not null references auth.users (id) on delete cascade,
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_items_source_type_check
    check (source_type in ('worksheet_selection')),
  constraint commercial_items_source_status_check
    check (source_status in ('current', 'stale', 'broken', 'needs_review')),
  constraint commercial_items_source_range_not_blank
    check (char_length(trim(source_range)) > 0),
  constraint commercial_items_source_signature_not_blank
    check (char_length(trim(source_signature)) > 0),
  constraint commercial_items_source_version_positive
    check (source_version > 0),
  constraint commercial_items_snapshot_json_object_check
    check (jsonb_typeof(snapshot_json) = 'object'),
  constraint commercial_items_source_link_json_object_check
    check (jsonb_typeof(source_link_json) = 'object'),
  constraint commercial_items_locked_metadata_json_object_check
    check (jsonb_typeof(locked_metadata_json) = 'object'),
  constraint commercial_items_ucl_validation_status_check
    check (ucl_validation_status in ('not_reviewed', 'valid', 'invalid'))
);

create index if not exists commercial_items_org_idx
  on public.commercial_items (organization_id);

create index if not exists commercial_items_org_opportunity_idx
  on public.commercial_items (organization_id, opportunity_id, created_at desc);

create index if not exists commercial_items_org_project_idx
  on public.commercial_items (organization_id, project_id, created_at desc)
  where project_id is not null;

create index if not exists commercial_items_source_sheet_idx
  on public.commercial_items (organization_id, source_sheet_id, created_at desc);

create index if not exists commercial_items_source_signature_idx
  on public.commercial_items (organization_id, source_signature);

create index if not exists commercial_items_status_idx
  on public.commercial_items (organization_id, source_status, updated_at desc);

create index if not exists commercial_items_source_lookup_idx
  on public.commercial_items (
    organization_id,
    source_workbook_id,
    source_sheet_id,
    source_range,
    source_version desc
  );

drop trigger if exists set_commercial_items_updated_at on public.commercial_items;
create trigger set_commercial_items_updated_at
before update on public.commercial_items
for each row execute function public.set_updated_at();

alter table public.commercial_items enable row level security;
alter table public.commercial_items force row level security;

drop policy if exists "Members can view commercial items" on public.commercial_items;
create policy "Members can view commercial items"
on public.commercial_items
for select
to authenticated
using (public.is_member_of_organization(commercial_items.organization_id));

drop policy if exists "Privileged members can create commercial items" on public.commercial_items;
create policy "Privileged members can create commercial items"
on public.commercial_items
for insert
to authenticated
with check (
  commercial_items.created_by = auth.uid()
  and commercial_items.updated_by = auth.uid()
  and public.has_org_permission(commercial_items.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = commercial_items.opportunity_id
      and o.organization_id = commercial_items.organization_id
  )
  and (
    commercial_items.project_id is null
    or exists (
      select 1
      from public.organization_projects p
      where p.id = commercial_items.project_id
        and p.organization_id = commercial_items.organization_id
    )
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = commercial_items.source_workbook_id
      and workbook.organization_id = commercial_items.organization_id
      and workbook.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets worksheet
    where worksheet.id = commercial_items.source_worksheet_id
      and worksheet.organization_id = commercial_items.organization_id
      and worksheet.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.id = commercial_items.source_sheet_id
      and sheet.organization_id = commercial_items.organization_id
      and sheet.opportunity_id = commercial_items.opportunity_id
      and sheet.workbook_id = commercial_items.source_workbook_id
  )
);

drop policy if exists "Privileged members can update commercial items" on public.commercial_items;
create policy "Privileged members can update commercial items"
on public.commercial_items
for update
to authenticated
using (
  public.has_org_permission(commercial_items.organization_id, 'leads.opportunities.write')
)
with check (
  commercial_items.updated_by = auth.uid()
  and public.has_org_permission(commercial_items.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = commercial_items.opportunity_id
      and o.organization_id = commercial_items.organization_id
  )
  and (
    commercial_items.project_id is null
    or exists (
      select 1
      from public.organization_projects p
      where p.id = commercial_items.project_id
        and p.organization_id = commercial_items.organization_id
    )
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = commercial_items.source_workbook_id
      and workbook.organization_id = commercial_items.organization_id
      and workbook.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.id = commercial_items.source_sheet_id
      and sheet.organization_id = commercial_items.organization_id
      and sheet.opportunity_id = commercial_items.opportunity_id
      and sheet.workbook_id = commercial_items.source_workbook_id
  )
);

drop policy if exists "Admins can delete commercial items" on public.commercial_items;
create policy "Admins can delete commercial items"
on public.commercial_items
for delete
to authenticated
using (public.is_admin_of_organization(commercial_items.organization_id));

grant select, insert, update, delete
on public.commercial_items
to authenticated;

create table if not exists public.commercial_item_document_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  commercial_item_id uuid not null references public.commercial_items (id) on delete cascade,
  document_kind text not null,
  document_id uuid not null,
  document_line_id uuid not null,
  link_role text not null default 'source',
  snapshot_at_link_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint commercial_item_document_links_document_kind_check
    check (document_kind in ('quote_line', 'purchase_order_line', 'variation_line', 'budget_item', 'claim_line', 'invoice_line')),
  constraint commercial_item_document_links_link_role_check
    check (link_role in ('source', 'reference')),
  constraint commercial_item_document_links_snapshot_json_object_check
    check (jsonb_typeof(snapshot_at_link_json) = 'object')
);

create index if not exists commercial_item_document_links_commercial_item_idx
  on public.commercial_item_document_links (commercial_item_id, created_at desc);

create index if not exists commercial_item_document_links_doc_lookup_idx
  on public.commercial_item_document_links (organization_id, document_kind, document_id, created_at desc);

create index if not exists commercial_item_document_links_doc_line_idx
  on public.commercial_item_document_links (organization_id, document_kind, document_line_id);

create unique index if not exists commercial_item_document_links_unique_doc_line_source_idx
  on public.commercial_item_document_links (commercial_item_id, document_kind, document_line_id);

alter table public.commercial_item_document_links enable row level security;
alter table public.commercial_item_document_links force row level security;

drop policy if exists "Members can view commercial item document links" on public.commercial_item_document_links;
create policy "Members can view commercial item document links"
on public.commercial_item_document_links
for select
to authenticated
using (public.is_member_of_organization(commercial_item_document_links.organization_id));

drop policy if exists "Members can create commercial item document links" on public.commercial_item_document_links;
create policy "Members can create commercial item document links"
on public.commercial_item_document_links
for insert
to authenticated
with check (
  commercial_item_document_links.created_by = auth.uid()
  and public.is_member_of_organization(commercial_item_document_links.organization_id)
  and exists (
    select 1
    from public.commercial_items item
    where item.id = commercial_item_document_links.commercial_item_id
      and item.organization_id = commercial_item_document_links.organization_id
  )
  and (
    (
      commercial_item_document_links.document_kind = 'quote_line'
      and public.has_org_permission(commercial_item_document_links.organization_id, 'quotes.write')
      and exists (
        select 1
        from public.project_quote_line_items line
        join public.project_quotes quote on quote.id = line.quote_id
        where line.id = commercial_item_document_links.document_line_id
          and line.quote_id = commercial_item_document_links.document_id
          and line.organization_id = commercial_item_document_links.organization_id
          and quote.organization_id = commercial_item_document_links.organization_id
      )
    )
    or (
      commercial_item_document_links.document_kind = 'purchase_order_line'
      and public.has_org_permission(commercial_item_document_links.organization_id, 'purchase_orders.write')
      and exists (
        select 1
        from public.project_purchase_order_line_items line
        join public.project_purchase_orders purchase_order on purchase_order.id = line.purchase_order_id
        where line.id = commercial_item_document_links.document_line_id
          and line.purchase_order_id = commercial_item_document_links.document_id
          and line.organization_id = commercial_item_document_links.organization_id
          and purchase_order.organization_id = commercial_item_document_links.organization_id
      )
    )
    or (
      commercial_item_document_links.document_kind = 'variation_line'
      and public.has_org_permission(commercial_item_document_links.organization_id, 'variations.write')
      and exists (
        select 1
        from public.project_variation_line_items line
        join public.project_variations variation on variation.id = line.variation_id
        where line.id = commercial_item_document_links.document_line_id
          and line.variation_id = commercial_item_document_links.document_id
          and line.organization_id = commercial_item_document_links.organization_id
          and variation.organization_id = commercial_item_document_links.organization_id
      )
    )
  )
);

drop policy if exists "Admins can delete commercial item document links" on public.commercial_item_document_links;
create policy "Admins can delete commercial item document links"
on public.commercial_item_document_links
for delete
to authenticated
using (public.is_admin_of_organization(commercial_item_document_links.organization_id));

grant select, insert, delete
on public.commercial_item_document_links
to authenticated;

create or replace function public.get_commercial_item(p_commercial_item_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  opportunity_id uuid,
  project_id uuid,
  source_type text,
  source_workbook_id uuid,
  source_worksheet_id uuid,
  source_sheet_id uuid,
  source_range text,
  source_signature text,
  source_version integer,
  source_status text,
  stale_reason_code text,
  last_source_checked_at timestamptz,
  last_source_changed_at timestamptz,
  description text,
  quantity numeric,
  unit text,
  rate numeric,
  total numeric,
  snapshot_json jsonb,
  source_link_json jsonb,
  locked_metadata_json jsonb,
  ucl_classification text,
  ucl_validation_status text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  return query
  select
    item.id,
    item.organization_id,
    item.opportunity_id,
    item.project_id,
    item.source_type,
    item.source_workbook_id,
    item.source_worksheet_id,
    item.source_sheet_id,
    item.source_range,
    item.source_signature,
    item.source_version,
    item.source_status,
    item.stale_reason_code,
    item.last_source_checked_at,
    item.last_source_changed_at,
    item.description,
    item.quantity,
    item.unit,
    item.rate,
    item.total,
    item.snapshot_json,
    item.source_link_json,
    item.locked_metadata_json,
    item.ucl_classification,
    item.ucl_validation_status,
    item.created_by,
    item.updated_by,
    item.created_at,
    item.updated_at
  from public.commercial_items item
  where item.id = p_commercial_item_id
    and public.is_member_of_organization(item.organization_id);
end;
$$;

create or replace function public.list_commercial_items_for_opportunity(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  opportunity_id uuid,
  project_id uuid,
  source_type text,
  source_workbook_id uuid,
  source_worksheet_id uuid,
  source_sheet_id uuid,
  source_range text,
  source_signature text,
  source_version integer,
  source_status text,
  stale_reason_code text,
  last_source_checked_at timestamptz,
  last_source_changed_at timestamptz,
  description text,
  quantity numeric,
  unit text,
  rate numeric,
  total numeric,
  snapshot_json jsonb,
  source_link_json jsonb,
  locked_metadata_json jsonb,
  ucl_classification text,
  ucl_validation_status text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  return query
  select
    item.id,
    item.organization_id,
    item.opportunity_id,
    item.project_id,
    item.source_type,
    item.source_workbook_id,
    item.source_worksheet_id,
    item.source_sheet_id,
    item.source_range,
    item.source_signature,
    item.source_version,
    item.source_status,
    item.stale_reason_code,
    item.last_source_checked_at,
    item.last_source_changed_at,
    item.description,
    item.quantity,
    item.unit,
    item.rate,
    item.total,
    item.snapshot_json,
    item.source_link_json,
    item.locked_metadata_json,
    item.ucl_classification,
    item.ucl_validation_status,
    item.created_by,
    item.updated_by,
    item.created_at,
    item.updated_at
  from public.commercial_items item
  where item.organization_id = p_organization_id
    and item.opportunity_id = p_opportunity_id
  order by item.created_at desc;
end;
$$;

create or replace function public.create_commercial_item(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  opportunity_id uuid,
  project_id uuid,
  source_type text,
  source_workbook_id uuid,
  source_worksheet_id uuid,
  source_sheet_id uuid,
  source_range text,
  source_signature text,
  source_version integer,
  source_status text,
  stale_reason_code text,
  last_source_checked_at timestamptz,
  last_source_changed_at timestamptz,
  description text,
  quantity numeric,
  unit text,
  rate numeric,
  total numeric,
  snapshot_json jsonb,
  source_link_json jsonb,
  locked_metadata_json jsonb,
  ucl_classification text,
  ucl_validation_status text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_items%rowtype;
  resolved_organization_id uuid;
  resolved_opportunity_id uuid;
  resolved_project_id uuid;
  resolved_source_workbook_id uuid;
  resolved_source_worksheet_id uuid;
  resolved_source_sheet_id uuid;
  resolved_source_range text;
  resolved_source_signature text;
  resolved_source_version integer;
  resolved_source_status text;
  resolved_snapshot_json jsonb;
  resolved_source_link_json jsonb;
  resolved_locked_metadata_json jsonb;
  resolved_ucl_validation_status text;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_source_workbook_id := nullif(p_input->>'sourceWorkbookId', '')::uuid;
  resolved_source_worksheet_id := coalesce(
    nullif(p_input->>'sourceWorksheetId', '')::uuid,
    resolved_source_workbook_id
  );
  resolved_source_sheet_id := nullif(p_input->>'sourceSheetId', '')::uuid;
  resolved_source_range := coalesce(nullif(btrim(coalesce(p_input->>'sourceRange', '')), ''), '');
  resolved_source_signature := coalesce(nullif(btrim(coalesce(p_input->>'sourceSignature', '')), ''), '');
  resolved_source_version := coalesce(nullif(p_input->>'sourceVersion', '')::integer, 1);
  resolved_source_status := coalesce(nullif(p_input->>'sourceStatus', ''), 'current');
  resolved_snapshot_json := coalesce(p_input->'snapshotJson', '{}'::jsonb);
  resolved_source_link_json := coalesce(p_input->'sourceLinkJson', '{}'::jsonb);
  resolved_locked_metadata_json := coalesce(p_input->'lockedMetadataJson', '{}'::jsonb);
  resolved_ucl_validation_status := coalesce(nullif(p_input->>'uclValidationStatus', ''), 'not_reviewed');

  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  if resolved_opportunity_id is null then
    raise exception 'opportunityId is required';
  end if;

  if resolved_source_workbook_id is null then
    raise exception 'sourceWorkbookId is required';
  end if;

  if resolved_source_sheet_id is null then
    raise exception 'sourceSheetId is required';
  end if;

  if resolved_source_range = '' then
    raise exception 'sourceRange is required';
  end if;

  if resolved_source_signature = '' then
    raise exception 'sourceSignature is required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized to create commercial items for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_opportunities o
    where o.id = resolved_opportunity_id
      and o.organization_id = resolved_organization_id
  ) then
    raise exception 'Opportunity not found for organization';
  end if;

  if resolved_project_id is not null and not exists (
    select 1
    from public.organization_projects p
    where p.id = resolved_project_id
      and p.organization_id = resolved_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if not exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = resolved_source_workbook_id
      and workbook.organization_id = resolved_organization_id
      and workbook.opportunity_id = resolved_opportunity_id
  ) then
    raise exception 'Workbook not found for organization opportunity';
  end if;

  if not exists (
    select 1
    from public.opportunity_pricing_worksheets worksheet
    where worksheet.id = resolved_source_worksheet_id
      and worksheet.organization_id = resolved_organization_id
      and worksheet.opportunity_id = resolved_opportunity_id
  ) then
    raise exception 'Worksheet not found for organization opportunity';
  end if;

  if not exists (
    select 1
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.id = resolved_source_sheet_id
      and sheet.organization_id = resolved_organization_id
      and sheet.opportunity_id = resolved_opportunity_id
      and sheet.workbook_id = resolved_source_workbook_id
  ) then
    raise exception 'Sheet not found for workbook';
  end if;

  insert into public.commercial_items (
    organization_id,
    opportunity_id,
    project_id,
    source_type,
    source_workbook_id,
    source_worksheet_id,
    source_sheet_id,
    source_range,
    source_signature,
    source_version,
    source_status,
    stale_reason_code,
    last_source_checked_at,
    last_source_changed_at,
    description,
    quantity,
    unit,
    rate,
    total,
    snapshot_json,
    source_link_json,
    locked_metadata_json,
    ucl_classification,
    ucl_validation_status,
    created_by,
    updated_by
  )
  values (
    resolved_organization_id,
    resolved_opportunity_id,
    resolved_project_id,
    coalesce(nullif(p_input->>'sourceType', ''), 'worksheet_selection'),
    resolved_source_workbook_id,
    resolved_source_worksheet_id,
    resolved_source_sheet_id,
    resolved_source_range,
    resolved_source_signature,
    resolved_source_version,
    resolved_source_status,
    nullif(p_input->>'staleReasonCode', ''),
    nullif(p_input->>'lastSourceCheckedAt', '')::timestamptz,
    nullif(p_input->>'lastSourceChangedAt', '')::timestamptz,
    coalesce(p_input->>'description', ''),
    nullif(p_input->>'quantity', '')::numeric,
    nullif(p_input->>'unit', ''),
    nullif(p_input->>'rate', '')::numeric,
    nullif(p_input->>'total', '')::numeric,
    resolved_snapshot_json,
    resolved_source_link_json,
    resolved_locked_metadata_json,
    nullif(p_input->>'uclClassification', ''),
    resolved_ucl_validation_status,
    actor_user_id,
    actor_user_id
  )
  returning * into inserted_row;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.opportunity_id,
    inserted_row.project_id,
    inserted_row.source_type,
    inserted_row.source_workbook_id,
    inserted_row.source_worksheet_id,
    inserted_row.source_sheet_id,
    inserted_row.source_range,
    inserted_row.source_signature,
    inserted_row.source_version,
    inserted_row.source_status,
    inserted_row.stale_reason_code,
    inserted_row.last_source_checked_at,
    inserted_row.last_source_changed_at,
    inserted_row.description,
    inserted_row.quantity,
    inserted_row.unit,
    inserted_row.rate,
    inserted_row.total,
    inserted_row.snapshot_json,
    inserted_row.source_link_json,
    inserted_row.locked_metadata_json,
    inserted_row.ucl_classification,
    inserted_row.ucl_validation_status,
    inserted_row.created_by,
    inserted_row.updated_by,
    inserted_row.created_at,
    inserted_row.updated_at;
end;
$$;

create or replace function public.link_commercial_item_to_quote_line(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  commercial_item_id uuid,
  document_kind text,
  document_id uuid,
  document_line_id uuid,
  link_role text,
  snapshot_at_link_json jsonb,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_item_document_links%rowtype;
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_commercial_item_id uuid := nullif(p_input->>'commercialItemId', '')::uuid;
  resolved_quote_id uuid := nullif(p_input->>'quoteId', '')::uuid;
  resolved_quote_line_id uuid := nullif(p_input->>'quoteLineId', '')::uuid;
  resolved_snapshot_json jsonb := coalesce(p_input->'snapshotAtLinkJson', '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if resolved_organization_id is null or resolved_commercial_item_id is null or resolved_quote_id is null or resolved_quote_line_id is null then
    raise exception 'organizationId, commercialItemId, quoteId, and quoteLineId are required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'quotes.write') then
    raise exception 'Not authorized to link commercial items to quote lines';
  end if;

  if not exists (
    select 1
    from public.commercial_items item
    where item.id = resolved_commercial_item_id
      and item.organization_id = resolved_organization_id
  ) then
    raise exception 'Commercial item not found for organization';
  end if;

  if not exists (
    select 1
    from public.project_quote_line_items line
    join public.project_quotes quote on quote.id = line.quote_id
    where line.id = resolved_quote_line_id
      and line.quote_id = resolved_quote_id
      and line.organization_id = resolved_organization_id
      and quote.organization_id = resolved_organization_id
  ) then
    raise exception 'Quote line not found for organization';
  end if;

  insert into public.commercial_item_document_links (
    organization_id,
    commercial_item_id,
    document_kind,
    document_id,
    document_line_id,
    link_role,
    snapshot_at_link_json,
    created_by
  )
  values (
    resolved_organization_id,
    resolved_commercial_item_id,
    'quote_line',
    resolved_quote_id,
    resolved_quote_line_id,
    coalesce(nullif(p_input->>'linkRole', ''), 'source'),
    resolved_snapshot_json,
    actor_user_id
  )
  on conflict (commercial_item_id, document_kind, document_line_id)
  do update set
    snapshot_at_link_json = excluded.snapshot_at_link_json,
    link_role = excluded.link_role
  returning * into inserted_row;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.commercial_item_id,
    inserted_row.document_kind,
    inserted_row.document_id,
    inserted_row.document_line_id,
    inserted_row.link_role,
    inserted_row.snapshot_at_link_json,
    inserted_row.created_by,
    inserted_row.created_at;
end;
$$;

create or replace function public.link_commercial_item_to_purchase_order_line(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  commercial_item_id uuid,
  document_kind text,
  document_id uuid,
  document_line_id uuid,
  link_role text,
  snapshot_at_link_json jsonb,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_item_document_links%rowtype;
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_commercial_item_id uuid := nullif(p_input->>'commercialItemId', '')::uuid;
  resolved_purchase_order_id uuid := nullif(p_input->>'purchaseOrderId', '')::uuid;
  resolved_purchase_order_line_id uuid := nullif(p_input->>'purchaseOrderLineId', '')::uuid;
  resolved_snapshot_json jsonb := coalesce(p_input->'snapshotAtLinkJson', '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if resolved_organization_id is null or resolved_commercial_item_id is null or resolved_purchase_order_id is null or resolved_purchase_order_line_id is null then
    raise exception 'organizationId, commercialItemId, purchaseOrderId, and purchaseOrderLineId are required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized to link commercial items to purchase order lines';
  end if;

  if not exists (
    select 1
    from public.commercial_items item
    where item.id = resolved_commercial_item_id
      and item.organization_id = resolved_organization_id
  ) then
    raise exception 'Commercial item not found for organization';
  end if;

  if not exists (
    select 1
    from public.project_purchase_order_line_items line
    join public.project_purchase_orders purchase_order on purchase_order.id = line.purchase_order_id
    where line.id = resolved_purchase_order_line_id
      and line.purchase_order_id = resolved_purchase_order_id
      and line.organization_id = resolved_organization_id
      and purchase_order.organization_id = resolved_organization_id
  ) then
    raise exception 'Purchase order line not found for organization';
  end if;

  insert into public.commercial_item_document_links (
    organization_id,
    commercial_item_id,
    document_kind,
    document_id,
    document_line_id,
    link_role,
    snapshot_at_link_json,
    created_by
  )
  values (
    resolved_organization_id,
    resolved_commercial_item_id,
    'purchase_order_line',
    resolved_purchase_order_id,
    resolved_purchase_order_line_id,
    coalesce(nullif(p_input->>'linkRole', ''), 'source'),
    resolved_snapshot_json,
    actor_user_id
  )
  on conflict (commercial_item_id, document_kind, document_line_id)
  do update set
    snapshot_at_link_json = excluded.snapshot_at_link_json,
    link_role = excluded.link_role
  returning * into inserted_row;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.commercial_item_id,
    inserted_row.document_kind,
    inserted_row.document_id,
    inserted_row.document_line_id,
    inserted_row.link_role,
    inserted_row.snapshot_at_link_json,
    inserted_row.created_by,
    inserted_row.created_at;
end;
$$;

grant execute on function public.get_commercial_item(uuid) to authenticated;
grant execute on function public.list_commercial_items_for_opportunity(uuid, uuid) to authenticated;
grant execute on function public.create_commercial_item(jsonb) to authenticated;
grant execute on function public.link_commercial_item_to_quote_line(jsonb) to authenticated;
grant execute on function public.link_commercial_item_to_purchase_order_line(jsonb) to authenticated;
