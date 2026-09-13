begin;

alter table public.project_quotes
  add column if not exists predecessor_quote_id uuid null,
  add column if not exists revision_number integer not null default 1,
  add column if not exists revision_kind text not null default 'tender',
  add column if not exists revision_created_at timestamptz not null default timezone('utc', now()),
  add column if not exists revision_created_by uuid null references auth.users (id) on delete set null,
  add column if not exists award_locked_at timestamptz null,
  add column if not exists award_locked_reason text null,
  add column if not exists publication_basis_hash text null,
  add column if not exists published_at timestamptz null;

update public.project_quotes
set revision_created_by = created_by
where revision_created_by is null;

alter table public.project_quotes
  add constraint project_quotes_revision_number_positive
    check (revision_number > 0),
  add constraint project_quotes_revision_kind_check
    check (revision_kind in ('tender', 'project_working', 'manual')),
  add constraint project_quotes_award_lock_complete_check
    check (
      (award_locked_at is null and award_locked_reason is null)
      or (award_locked_at is not null and char_length(btrim(award_locked_reason)) > 0)
    ),
  add constraint project_quotes_org_predecessor_fkey
    foreign key (organization_id, predecessor_quote_id)
    references public.project_quotes (organization_id, id)
    on delete restrict;

create unique index project_quotes_one_successor_per_revision_idx
  on public.project_quotes (organization_id, predecessor_quote_id)
  where predecessor_quote_id is not null;

create index project_quotes_revision_chain_idx
  on public.project_quotes (organization_id, originating_opportunity_id, revision_number, created_at);

alter table public.project_quote_line_items
  add column if not exists pricing_source_kind text null;

alter table public.project_quote_line_items
  add constraint project_quote_line_items_organization_id_id_key
    unique (organization_id, id);

alter table public.commercial_items
  add constraint commercial_items_organization_id_id_key
    unique (organization_id, id);

update public.project_quote_line_items line
set pricing_source_kind = 'worksheet'
where exists (
  select 1
  from public.commercial_item_document_links link
  where link.organization_id = line.organization_id
    and link.document_kind = 'quote_line'
    and link.link_role = 'source'
    and link.document_id = line.quote_id
    and link.document_line_id = line.id
);

update public.project_quote_line_items line
set pricing_source_kind = case
  when not exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    join public.project_quotes quote
      on quote.organization_id = workbook.organization_id
     and quote.id = line.quote_id
     and quote.originating_opportunity_id = workbook.opportunity_id
    where workbook.organization_id = line.organization_id
      and workbook.archived_at is null
      and workbook.quote_id is null
      and workbook.variation_id is null
  ) then 'manual'
  else 'unresolved'
end
where line.pricing_source_kind is null;

alter table public.project_quote_line_items
  alter column pricing_source_kind set default 'manual',
  alter column pricing_source_kind set not null,
  add constraint project_quote_line_items_pricing_source_kind_check
    check (pricing_source_kind in ('worksheet', 'manual', 'unresolved'));

create or replace function public.sync_quote_line_pricing_source_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_link public.commercial_item_document_links%rowtype;
begin
  target_link := case when tg_op = 'DELETE' then old else new end;
  if target_link.document_kind <> 'quote_line' or target_link.link_role <> 'source' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if exists (
    select 1
    from public.project_quotes quote
    where quote.organization_id = target_link.organization_id
      and quote.id = target_link.document_id
      and quote.award_locked_at is not null
  ) then
    raise exception 'Worksheet links belonging to an award-locked quote are immutable' using errcode = 'TS409';
  end if;

  update public.project_quote_line_items line
  set pricing_source_kind = case when tg_op = 'DELETE' then 'manual' else 'worksheet' end
  where line.organization_id = target_link.organization_id
    and line.quote_id = target_link.document_id
    and line.id = target_link.document_line_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger sync_quote_line_pricing_source_kind
before insert or update or delete on public.commercial_item_document_links
for each row execute function public.sync_quote_line_pricing_source_kind();

create table public.opportunity_award_pricing_manifests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  opportunity_id uuid not null,
  project_id uuid not null,
  accepted_quote_id uuid not null,
  working_quote_id uuid null,
  classification text not null,
  source_workbook_count integer not null default 0,
  worksheet_line_count integer not null default 0,
  manual_line_count integer not null default 0,
  quote_subtotal_snapshot numeric(14,2) not null,
  quote_gst_snapshot numeric(14,2) not null,
  quote_total_snapshot numeric(14,2) not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_award_pricing_manifests_classification_check
    check (classification in ('EXACT', 'DERIVABLE', 'AMBIGUOUS', 'MANUAL_ONLY', 'MIXED', 'NO_WORKSHEET', 'BROKEN_LINEAGE')),
  constraint opportunity_award_pricing_manifests_counts_non_negative
    check (source_workbook_count >= 0 and worksheet_line_count >= 0 and manual_line_count >= 0),
  constraint opportunity_award_pricing_manifests_org_opportunity_fkey
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifests_org_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifests_org_quote_fkey
    foreign key (organization_id, accepted_quote_id)
    references public.project_quotes (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifests_org_working_quote_fkey
    foreign key (organization_id, working_quote_id)
    references public.project_quotes (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifests_org_id_unique unique (organization_id, id),
  constraint opportunity_award_pricing_manifests_opportunity_unique unique (opportunity_id),
  constraint opportunity_award_pricing_manifests_quote_unique unique (accepted_quote_id)
);

create unique index opportunity_award_pricing_manifests_working_quote_unique
  on public.opportunity_award_pricing_manifests (working_quote_id)
  where working_quote_id is not null;

create index opportunity_award_pricing_manifests_project_idx
  on public.opportunity_award_pricing_manifests (organization_id, project_id);

create table public.opportunity_award_pricing_manifest_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  manifest_id uuid not null,
  source_workbook_id uuid not null,
  source_sheet_id uuid not null,
  source_workbook_version integer not null,
  source_sheet_version integer not null,
  source_range text not null,
  source_signature text not null,
  commercial_item_id uuid not null,
  workbook_snapshot jsonb not null,
  sheet_snapshot jsonb not null,
  material_bindings_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_award_pricing_manifest_sources_versions_positive
    check (source_workbook_version > 0 and source_sheet_version > 0),
  constraint opportunity_award_pricing_manifest_sources_range_not_blank
    check (char_length(btrim(source_range)) > 0 and char_length(btrim(source_signature)) > 0),
  constraint opportunity_award_pricing_manifest_sources_snapshots_check
    check (
      jsonb_typeof(workbook_snapshot) = 'object'
      and jsonb_typeof(sheet_snapshot) = 'object'
      and jsonb_typeof(material_bindings_snapshot) = 'array'
    ),
  constraint opportunity_award_pricing_manifest_sources_org_manifest_fkey
    foreign key (organization_id, manifest_id)
    references public.opportunity_award_pricing_manifests (organization_id, id) on delete cascade,
  constraint opportunity_award_pricing_manifest_sources_org_workbook_fkey
    foreign key (organization_id, source_workbook_id)
    references public.opportunity_pricing_worksheets (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifest_sources_org_sheet_fkey
    foreign key (organization_id, source_workbook_id, source_sheet_id)
    references public.opportunity_pricing_workbook_sheets (organization_id, workbook_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifest_sources_org_item_fkey
    foreign key (organization_id, commercial_item_id)
    references public.commercial_items (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifest_sources_org_id_unique unique (organization_id, id),
  constraint opportunity_award_pricing_manifest_sources_evidence_unique
    unique (manifest_id, commercial_item_id, source_sheet_id, source_range)
);

create index opportunity_award_pricing_manifest_sources_workbook_idx
  on public.opportunity_award_pricing_manifest_sources (organization_id, source_workbook_id, source_sheet_id);

create table public.opportunity_award_pricing_manifest_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  manifest_id uuid not null,
  quote_line_id uuid not null,
  source_kind text not null,
  manifest_source_id uuid null,
  commercial_item_id uuid null,
  quote_line_snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_award_pricing_manifest_lines_source_kind_check
    check (source_kind in ('worksheet', 'manual')),
  constraint opportunity_award_pricing_manifest_lines_source_complete_check
    check (
      (source_kind = 'manual' and manifest_source_id is null and commercial_item_id is null)
      or (source_kind = 'worksheet' and manifest_source_id is not null and commercial_item_id is not null)
    ),
  constraint opportunity_award_pricing_manifest_lines_snapshot_check
    check (jsonb_typeof(quote_line_snapshot) = 'object'),
  constraint opportunity_award_pricing_manifest_lines_org_manifest_fkey
    foreign key (organization_id, manifest_id)
    references public.opportunity_award_pricing_manifests (organization_id, id) on delete cascade,
  constraint opportunity_award_pricing_manifest_lines_org_source_fkey
    foreign key (organization_id, manifest_source_id)
    references public.opportunity_award_pricing_manifest_sources (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifest_lines_org_line_fkey
    foreign key (organization_id, quote_line_id)
    references public.project_quote_line_items (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifest_lines_org_item_fkey
    foreign key (organization_id, commercial_item_id)
    references public.commercial_items (organization_id, id) on delete restrict,
  constraint opportunity_award_pricing_manifest_lines_quote_line_unique unique (quote_line_id)
);

alter table public.opportunity_pricing_worksheets
  add column if not exists source_workbook_id uuid null,
  add column if not exists source_workbook_version integer null,
  add column if not exists source_award_manifest_id uuid null,
  add column if not exists clone_kind text null,
  add column if not exists award_locked_at timestamptz null,
  add column if not exists award_locked_reason text null,
  add constraint opportunity_pricing_worksheets_org_source_workbook_fkey
    foreign key (organization_id, source_workbook_id)
    references public.opportunity_pricing_worksheets (organization_id, id) on delete restrict,
  add constraint opportunity_pricing_worksheets_org_award_manifest_fkey
    foreign key (organization_id, source_award_manifest_id)
    references public.opportunity_award_pricing_manifests (organization_id, id) on delete restrict,
  add constraint opportunity_pricing_worksheets_clone_lineage_check
    check (
      (clone_kind is null and source_workbook_id is null and source_workbook_version is null and source_award_manifest_id is null)
      or (
        clone_kind = 'project_working'
        and source_workbook_id is not null
        and source_workbook_version is not null
        and source_workbook_version > 0
        and source_award_manifest_id is not null
        and project_id is not null
        and quote_id is not null
      )
    ),
  add constraint opportunity_pricing_worksheets_award_lock_complete_check
    check (
      (award_locked_at is null and award_locked_reason is null)
      or (award_locked_at is not null and char_length(btrim(award_locked_reason)) > 0)
    );

create unique index opportunity_pricing_worksheets_quote_source_clone_unique
  on public.opportunity_pricing_worksheets (organization_id, quote_id, source_workbook_id)
  where clone_kind = 'project_working' and archived_at is null;

create or replace function public.validate_project_quote_revision_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  predecessor public.project_quotes%rowtype;
begin
  if new.predecessor_quote_id is null then
    if new.revision_number <> 1 then
      raise exception 'Root quote revision_number must be 1' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.predecessor_quote_id = new.id then
    raise exception 'Quote revision cannot be its own predecessor' using errcode = '23514';
  end if;

  select * into predecessor
  from public.project_quotes quote
  where quote.organization_id = new.organization_id
    and quote.id = new.predecessor_quote_id;

  if not found
    or predecessor.originating_opportunity_id is distinct from new.originating_opportunity_id
    or predecessor.project_id is distinct from new.project_id
  then
    raise exception 'Quote predecessor must belong to the same organization, Opportunity, and Project'
      using errcode = '23514';
  end if;

  if new.revision_number <> predecessor.revision_number + 1 then
    raise exception 'Quote revision_number must follow its predecessor' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_project_quote_revision_lineage
before insert or update of predecessor_quote_id, revision_number, organization_id, originating_opportunity_id, project_id
on public.project_quotes
for each row execute function public.validate_project_quote_revision_lineage();

create or replace function public.reject_award_locked_quote_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.award_locked_at is not null then
    raise exception 'Award-locked quote revisions are immutable' using errcode = 'TS409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger reject_award_locked_quote_mutation
before update or delete on public.project_quotes
for each row execute function public.reject_award_locked_quote_mutation();

create or replace function public.reject_award_locked_quote_line_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_line public.project_quote_line_items%rowtype;
  locked_quote public.project_quotes%rowtype;
begin
  target_line := case when tg_op = 'DELETE' then old else new end;
  select * into locked_quote
  from public.project_quotes quote
  where quote.organization_id = target_line.organization_id
    and quote.id = target_line.quote_id;

  if locked_quote.award_locked_at is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'project_id' - 'updated_at') = (to_jsonb(old) - 'project_id' - 'updated_at')
    and exists (
      select 1
      from public.opportunity_final_projects mapping
      where mapping.organization_id = new.organization_id
        and mapping.accepted_quote_id = new.quote_id
        and mapping.project_id = new.project_id
    )
  then
    return new;
  end if;

  raise exception 'Lines belonging to an award-locked quote revision are immutable' using errcode = 'TS409';
end;
$$;

create trigger reject_award_locked_quote_line_mutation
before insert or update or delete on public.project_quote_line_items
for each row execute function public.reject_award_locked_quote_line_mutation();

create or replace function public.reject_award_locked_workbook_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.award_locked_at is not null then
    raise exception 'Award-locked tender workbooks are immutable' using errcode = 'TS409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger reject_award_locked_workbook_mutation
before update or delete on public.opportunity_pricing_worksheets
for each row execute function public.reject_award_locked_workbook_mutation();

create or replace function public.reject_award_locked_workbook_child_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_workbook_id uuid;
begin
  target_workbook_id := case when tg_op = 'DELETE' then old.workbook_id else new.workbook_id end;
  if exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = target_workbook_id
      and workbook.award_locked_at is not null
  ) then
    raise exception 'Children of an award-locked tender workbook are immutable' using errcode = 'TS409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger reject_award_locked_workbook_sheet_mutation
before insert or update or delete on public.opportunity_pricing_workbook_sheets
for each row execute function public.reject_award_locked_workbook_child_mutation();

create trigger reject_award_locked_workbook_material_binding_mutation
before insert or update or delete on public.worksheet_material_price_bindings
for each row execute function public.reject_award_locked_workbook_child_mutation();

create or replace function public.reject_opportunity_award_pricing_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Opportunity award pricing evidence is immutable' using errcode = 'TS409';
end;
$$;

create trigger reject_opportunity_award_pricing_manifest_mutation
before update or delete on public.opportunity_award_pricing_manifests
for each row execute function public.reject_opportunity_award_pricing_evidence_mutation();

create trigger reject_opportunity_award_pricing_source_mutation
before update or delete on public.opportunity_award_pricing_manifest_sources
for each row execute function public.reject_opportunity_award_pricing_evidence_mutation();

create trigger reject_opportunity_award_pricing_line_mutation
before update or delete on public.opportunity_award_pricing_manifest_lines
for each row execute function public.reject_opportunity_award_pricing_evidence_mutation();

alter table public.opportunity_award_pricing_manifests enable row level security;
alter table public.opportunity_award_pricing_manifests force row level security;
alter table public.opportunity_award_pricing_manifest_sources enable row level security;
alter table public.opportunity_award_pricing_manifest_sources force row level security;
alter table public.opportunity_award_pricing_manifest_lines enable row level security;
alter table public.opportunity_award_pricing_manifest_lines force row level security;

create policy "Members can view Opportunity award pricing manifests"
on public.opportunity_award_pricing_manifests
for select to authenticated
using (public.is_member_of_organization(organization_id));

create policy "Members can view Opportunity award pricing sources"
on public.opportunity_award_pricing_manifest_sources
for select to authenticated
using (public.is_member_of_organization(organization_id));

create policy "Members can view Opportunity award pricing lines"
on public.opportunity_award_pricing_manifest_lines
for select to authenticated
using (public.is_member_of_organization(organization_id));

revoke all on public.opportunity_award_pricing_manifests from public, anon, authenticated;
revoke all on public.opportunity_award_pricing_manifest_sources from public, anon, authenticated;
revoke all on public.opportunity_award_pricing_manifest_lines from public, anon, authenticated;
grant select on public.opportunity_award_pricing_manifests to authenticated;
grant select on public.opportunity_award_pricing_manifest_sources to authenticated;
grant select on public.opportunity_award_pricing_manifest_lines to authenticated;

commit;
