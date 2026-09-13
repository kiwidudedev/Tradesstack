begin;

-- A tender workspace and a delivered Project can both legitimately reference the
-- same Opportunity. This table is the authoritative, one-to-one designation of
-- the delivered Project; source_opportunity_id alone is intentionally not.
create table if not exists public.opportunity_final_projects (
  opportunity_id uuid primary key references public.organization_opportunities (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null unique references public.organization_projects (id) on delete restrict,
  accepted_quote_id uuid null references public.project_quotes (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists opportunity_final_projects_org_opportunity_uidx
  on public.opportunity_final_projects (organization_id, opportunity_id);

create unique index if not exists opportunity_final_projects_org_project_uidx
  on public.opportunity_final_projects (organization_id, project_id);

alter table public.opportunity_final_projects enable row level security;
alter table public.opportunity_final_projects force row level security;

drop policy if exists "Members can view final opportunity projects"
  on public.opportunity_final_projects;
create policy "Members can view final opportunity projects"
on public.opportunity_final_projects
for select
to authenticated
using (public.is_member_of_organization(organization_id));

revoke all on public.opportunity_final_projects from public, anon, authenticated;
grant select on public.opportunity_final_projects to authenticated;

-- Existing completed conversions are authoritative and safe to backfill. Fail
-- closed when their project/opportunity lineage is inconsistent.
do $$
declare
  invalid_count integer;
  duplicate_project_count integer;
begin
  select count(*)
  into invalid_count
  from public.organization_opportunities opportunity
  left join public.organization_projects project
    on project.id = opportunity.converted_project_id
   and project.organization_id = opportunity.organization_id
  where opportunity.converted_project_id is not null
    and (
      project.id is null
      or project.source_opportunity_id is distinct from opportunity.id
    );

  if invalid_count > 0 then
    raise exception
      'Cannot add final-project invariant: % converted Opportunities have invalid Project lineage',
      invalid_count;
  end if;

  select count(*)
  into duplicate_project_count
  from (
    select opportunity.converted_project_id
    from public.organization_opportunities opportunity
    where opportunity.converted_project_id is not null
    group by opportunity.converted_project_id
    having count(*) > 1
  ) duplicates;

  if duplicate_project_count > 0 then
    raise exception
      'Cannot add final-project invariant: % Projects are designated by multiple Opportunities',
      duplicate_project_count;
  end if;
end;
$$;

insert into public.opportunity_final_projects (
  opportunity_id,
  organization_id,
  project_id,
  accepted_quote_id,
  created_by,
  created_at
)
select
  opportunity.id,
  opportunity.organization_id,
  opportunity.converted_project_id,
  accepted_quote.id,
  project.created_by,
  coalesce(opportunity.converted_at, project.created_at, timezone('utc', now()))
from public.organization_opportunities opportunity
join public.organization_projects project
  on project.id = opportunity.converted_project_id
 and project.organization_id = opportunity.organization_id
left join lateral (
  select quote.id
  from public.project_quotes quote
  where quote.organization_id = opportunity.organization_id
    and quote.originating_opportunity_id = opportunity.id
    and quote.status = 'Accepted'
  order by quote.updated_at desc, quote.id desc
  limit 1
) accepted_quote on true
where opportunity.converted_project_id is not null
on conflict (opportunity_id) do nothing;

-- Attach canonical history only from an unattached state, the exact recorded
-- tender workspace, or the uniquely designated final Project.
create or replace function public.attach_opportunity_commercial_history_to_project(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid
)
returns table (
  attached_quote_count integer,
  attached_quote_line_count integer,
  attached_commercial_item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  target_row public.organization_projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization'
      using errcode = '42501';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
    and opportunity.organization_id = p_organization_id
  for key share;

  if not found then
    raise exception 'Opportunity not found for organization'
      using errcode = 'TS422';
  end if;

  if opportunity_row.workspace_project_id is null then
    raise exception 'Opportunity has no recorded tender workspace'
      using errcode = 'TS422';
  end if;

  select *
  into workspace_row
  from public.organization_projects project
  where project.id = opportunity_row.workspace_project_id
    and project.organization_id = p_organization_id;

  if not found
    or workspace_row.source_opportunity_id is distinct from opportunity_row.id
  then
    raise exception 'Tender workspace does not belong to the Opportunity'
      using errcode = 'TS409';
  end if;

  select *
  into target_row
  from public.organization_projects project
  where project.id = p_project_id
    and project.organization_id = p_organization_id;

  if not found
    or target_row.source_opportunity_id is distinct from opportunity_row.id
  then
    raise exception 'Final Project must belong to the same Opportunity'
      using errcode = 'TS409';
  end if;

  if not exists (
    select 1
    from public.opportunity_final_projects final_project
    where final_project.organization_id = p_organization_id
      and final_project.opportunity_id = p_opportunity_id
      and final_project.project_id = p_project_id
  ) then
    raise exception 'Target Project is not the designated final Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and quote.project_id is not null
      and quote.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial quote history is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.project_quote_line_items line
    join public.project_quotes quote
      on quote.id = line.quote_id
     and quote.organization_id = line.organization_id
    where line.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and line.project_id is not null
      and line.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial quote line history is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.commercial_items item
    where item.organization_id = p_organization_id
      and item.opportunity_id = p_opportunity_id
      and item.project_id is not null
      and item.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial items are attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.cost_items cost_item
    join public.project_quotes quote
      on quote.id = cost_item.source_document_id
     and cost_item.source_document_kind = 'project_quote'
     and quote.organization_id = cost_item.organization_id
    where cost_item.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and cost_item.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial CostItems are attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  with updated_quotes as (
    update public.project_quotes quote
    set project_id = target_row.id
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and (
        quote.project_id is null
        or quote.project_id = workspace_row.id
      )
    returning quote.id
  )
  select count(*)::integer
  into attached_quote_count
  from updated_quotes;

  with updated_lines as (
    update public.project_quote_line_items line
    set project_id = target_row.id
    from public.project_quotes quote
    where line.organization_id = p_organization_id
      and line.quote_id = quote.id
      and quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and (
        line.project_id is null
        or line.project_id = workspace_row.id
      )
    returning line.id
  )
  select count(*)::integer
  into attached_quote_line_count
  from updated_lines;

  update public.commercial_items item
  set project_id = target_row.id,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where item.organization_id = p_organization_id
    and item.opportunity_id = p_opportunity_id
    and (
      item.project_id is null
      or item.project_id = workspace_row.id
    );
  get diagnostics attached_commercial_item_count = row_count;

  update public.cost_items cost_item
  set project_id = target_row.id,
      updated_at = timezone('utc', now())
  from public.project_quotes quote
  where quote.id = cost_item.source_document_id
    and cost_item.source_document_kind = 'project_quote'
    and quote.organization_id = cost_item.organization_id
    and cost_item.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and cost_item.project_id = workspace_row.id;

  return query
  select
    coalesce(attached_quote_count, 0),
    coalesce(attached_quote_line_count, 0),
    coalesce(attached_commercial_item_count, 0);
end;
$$;

revoke all on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid)
from public, anon;
grant execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid)
to authenticated;

-- Post-commit workspace metadata cloning uses deterministic IDs supplied by the
-- server. Repeating an interrupted copy is therefore an upsert, not a duplicate.
create or replace function public.clone_workspace_metadata_to_project(
  p_organization_id uuid,
  p_target_project_id uuid,
  p_drawing_sets jsonb,
  p_trade_packs jsonb,
  p_scope_runs jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_projects project
    where project.id = p_target_project_id
      and project.organization_id = p_organization_id
  ) then
    raise exception 'Target Project not found for organization'
      using errcode = 'TS422';
  end if;

  if coalesce(jsonb_typeof(p_drawing_sets), 'null') = 'array'
    and jsonb_array_length(p_drawing_sets) > 0
  then
    insert into public.project_drawing_sets (
      id,
      organization_id,
      project_id,
      uploaded_by,
      file_name,
      storage_path,
      file_size_bytes,
      mime_type,
      uploaded_at
    )
    select
      row.id,
      row.organization_id,
      row.project_id,
      row.uploaded_by,
      row.file_name,
      row.storage_path,
      row.file_size_bytes,
      row.mime_type,
      row.uploaded_at
    from jsonb_to_recordset(p_drawing_sets) as row(
      id uuid,
      organization_id uuid,
      project_id uuid,
      uploaded_by uuid,
      file_name text,
      storage_path text,
      file_size_bytes bigint,
      mime_type text,
      uploaded_at timestamptz
    )
    on conflict (id) do update
    set file_name = excluded.file_name,
        storage_path = excluded.storage_path,
        file_size_bytes = excluded.file_size_bytes,
        mime_type = excluded.mime_type,
        uploaded_at = excluded.uploaded_at
    where project_drawing_sets.organization_id = excluded.organization_id
      and project_drawing_sets.project_id = excluded.project_id;
  end if;

  if coalesce(jsonb_typeof(p_trade_packs), 'null') = 'array'
    and jsonb_array_length(p_trade_packs) > 0
  then
    insert into public.trade_packs (
      id,
      organization_id,
      project_id,
      trade_id,
      trade_label,
      pdf_url,
      page_index_json,
      created_by,
      created_at
    )
    select
      row.id,
      row.organization_id,
      row.project_id,
      row.trade_id,
      row.trade_label,
      row.pdf_url,
      row.page_index_json,
      row.created_by,
      row.created_at
    from jsonb_to_recordset(p_trade_packs) as row(
      id uuid,
      organization_id uuid,
      project_id uuid,
      trade_id text,
      trade_label text,
      pdf_url text,
      page_index_json jsonb,
      created_by uuid,
      created_at timestamptz
    )
    on conflict (id) do update
    set trade_id = excluded.trade_id,
        trade_label = excluded.trade_label,
        pdf_url = excluded.pdf_url,
        page_index_json = excluded.page_index_json
    where trade_packs.organization_id = excluded.organization_id
      and trade_packs.project_id = excluded.project_id;
  end if;

  if coalesce(jsonb_typeof(p_scope_runs), 'null') = 'array'
    and jsonb_array_length(p_scope_runs) > 0
  then
    insert into public.scope_runs (
      id,
      organization_id,
      project_id,
      trade_pack_id,
      created_by,
      status,
      result_json,
      error_message,
      created_at,
      updated_at
    )
    select
      row.id,
      row.organization_id,
      row.project_id,
      row.trade_pack_id,
      row.created_by,
      row.status,
      row.result_json,
      row.error_message,
      row.created_at,
      row.updated_at
    from jsonb_to_recordset(p_scope_runs) as row(
      id uuid,
      organization_id uuid,
      project_id uuid,
      trade_pack_id uuid,
      created_by uuid,
      status text,
      result_json jsonb,
      error_message text,
      created_at timestamptz,
      updated_at timestamptz
    )
    on conflict (id) do update
    set status = excluded.status,
        result_json = excluded.result_json,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    where scope_runs.organization_id = excluded.organization_id
      and scope_runs.project_id = excluded.project_id;
  end if;
end;
$$;

revoke all on function public.clone_workspace_metadata_to_project(uuid, uuid, jsonb, jsonb, jsonb)
from public, anon;
grant execute on function public.clone_workspace_metadata_to_project(uuid, uuid, jsonb, jsonb, jsonb)
to authenticated;

create or replace function public.sync_opportunity_legacy_quote_on_conversion(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_legacy_quote_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization'
      using errcode = '42501';
  end if;

  -- Canonical history is authoritative. The pre-canonical opportunity quote is
  -- converted only when no canonical Project quote was attached.
  if exists (
    select 1
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.project_id = p_project_id
  ) then
    return;
  end if;

  select quote.id
  into latest_legacy_quote_id
  from public.opportunity_quotes quote
  where quote.organization_id = p_organization_id
    and quote.opportunity_id = p_opportunity_id
  order by quote.updated_at desc, quote.id desc
  limit 1;

  if latest_legacy_quote_id is not null then
    perform *
    from public.convert_opportunity_quote_to_project_quote(
      p_organization_id,
      p_opportunity_id,
      latest_legacy_quote_id,
      p_project_id,
      p_actor_user_id
    );
  end if;
end;
$$;

revoke all on function public.sync_opportunity_legacy_quote_on_conversion(uuid, uuid, uuid, uuid)
from public, anon;
grant execute on function public.sync_opportunity_legacy_quote_on_conversion(uuid, uuid, uuid, uuid)
to authenticated;

create or replace function public.convert_accepted_opportunity_to_project(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid
)
returns table (
  project_id uuid,
  project_slug text,
  project_created boolean,
  storage_clone_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  accepted_quote_row public.project_quotes%rowtype;
  final_project_row public.organization_projects%rowtype;
  existing_final_project_id uuid;
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 2;
  orphan_candidate_count integer;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization'
      using errcode = '42501';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
    and opportunity.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Opportunity not found for organization'
      using errcode = 'TS422';
  end if;

  select final_project.project_id
  into existing_final_project_id
  from public.opportunity_final_projects final_project
  where final_project.organization_id = p_organization_id
    and final_project.opportunity_id = p_opportunity_id;

  if existing_final_project_id is not null then
    select *
    into final_project_row
    from public.organization_projects project
    where project.id = existing_final_project_id
      and project.organization_id = p_organization_id;

    if not found then
      raise exception 'Designated final Project is missing'
        using errcode = 'TS409';
    end if;

    return query
    select final_project_row.id, final_project_row.slug, false, true;
    return;
  end if;

  select *
  into accepted_quote_row
  from public.project_quotes quote
  where quote.id = p_accepted_quote_id
    and quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Accepted quote does not belong to this Opportunity'
      using errcode = 'TS422';
  end if;

  if accepted_quote_row.status <> 'Accepted' then
    raise exception 'Quote must be Accepted before conversion'
      using errcode = 'TS422';
  end if;

  if exists (
    select 1
    from public.project_quotes newer_quote
    where newer_quote.organization_id = p_organization_id
      and newer_quote.originating_opportunity_id = p_opportunity_id
      and newer_quote.status = 'Accepted'
      and (
        newer_quote.updated_at > accepted_quote_row.updated_at
        or (
          newer_quote.updated_at = accepted_quote_row.updated_at
          and newer_quote.id > accepted_quote_row.id
        )
      )
  ) then
    raise exception 'Accepted quote has been superseded by a newer Accepted quote'
      using errcode = 'TS409';
  end if;

  if opportunity_row.workspace_project_id is null then
    raise exception 'Opportunity has no recorded tender workspace'
      using errcode = 'TS422';
  end if;

  select *
  into workspace_row
  from public.organization_projects project
  where project.id = opportunity_row.workspace_project_id
    and project.organization_id = p_organization_id
  for key share;

  if not found
    or workspace_row.source_opportunity_id is distinct from opportunity_row.id
  then
    raise exception 'Tender workspace does not belong to the Opportunity'
      using errcode = 'TS409';
  end if;

  if accepted_quote_row.project_id is not null
    and accepted_quote_row.project_id <> workspace_row.id
  then
    raise exception 'Accepted quote is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  select count(*)
  into orphan_candidate_count
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.source_opportunity_id = opportunity_row.id
    and project.id <> workspace_row.id;

  if orphan_candidate_count > 0 then
    raise exception
      'Opportunity has unclassified delivery Project candidates; administrative reconciliation is required'
      using errcode = 'TS409',
            detail = orphan_candidate_count::text;
  end if;

  base_slug := regexp_replace(
    regexp_replace(lower(btrim(opportunity_row.name)), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  );
  base_slug := coalesce(nullif(base_slug, ''), 'project');

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':project-slug:' || base_slug, 0)
  );

  candidate_slug := base_slug;
  while exists (
    select 1
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and lower(project.slug) = lower(candidate_slug)
  ) loop
    candidate_slug := base_slug || '-' || slug_suffix::text;
    slug_suffix := slug_suffix + 1;
  end loop;

  insert into public.organization_projects (
    organization_id,
    created_by,
    client_id,
    name,
    slug,
    stage,
    location,
    cover_image_url,
    source_opportunity_id
  )
  values (
    p_organization_id,
    actor_user_id,
    opportunity_row.client_id,
    opportunity_row.name,
    candidate_slug,
    'Pricing',
    coalesce(nullif(btrim(opportunity_row.location), ''), 'Unspecified'),
    null,
    opportunity_row.id
  )
  returning * into final_project_row;

  insert into public.opportunity_final_projects (
    opportunity_id,
    organization_id,
    project_id,
    accepted_quote_id,
    created_by
  )
  values (
    opportunity_row.id,
    p_organization_id,
    final_project_row.id,
    accepted_quote_row.id,
    actor_user_id
  );

  perform *
  from public.attach_opportunity_commercial_history_to_project(
    p_organization_id,
    opportunity_row.id,
    final_project_row.id
  );

  perform public.sync_opportunity_legacy_quote_on_conversion(
    p_organization_id,
    opportunity_row.id,
    final_project_row.id,
    actor_user_id
  );

  perform public.ensure_opportunity_project_document_workspace(
    opportunity_row.id,
    final_project_row.id
  );

  update public.organization_opportunities opportunity
  set converted_project_id = final_project_row.id,
      converted_at = timezone('utc', now()),
      stage = 'Won',
      quoted_at = coalesce(
        opportunity.quoted_at,
        accepted_quote_row.quote_date,
        timezone('utc', now())::date
      )
  where opportunity.id = opportunity_row.id
    and opportunity.organization_id = p_organization_id;

  return query
  select final_project_row.id, final_project_row.slug, true, true;
end;
$$;

revoke all on function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid)
from public, anon;
grant execute on function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid)
to authenticated;

comment on table public.opportunity_final_projects is
  'Authoritative one-to-one mapping for delivered Projects. Tender workspaces remain identified by organization_opportunities.workspace_project_id.';

comment on function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid) is
  'Atomically validates the current Accepted canonical quote, serializes conversion on the Opportunity row, creates at most one final Project, reparents eligible commercial history, and marks the Opportunity Won.';

commit;
