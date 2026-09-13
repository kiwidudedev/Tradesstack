alter table public.project_drawing_sets
  add column if not exists display_name text;

alter table public.project_drawing_sets
  add column if not exists sort_order integer;

alter table public.project_drawing_sets
  add column if not exists archived_at timestamptz null;

alter table public.project_drawing_sets
  add column if not exists archived_by uuid null references auth.users (id) on delete set null;

alter table public.project_drawing_sets
  add column if not exists source_type text;

alter table public.project_drawing_sets
  add column if not exists source_revision text;

update public.project_drawing_sets
set display_name = left(
  coalesce(
    nullif(trim(display_name), ''),
    nullif(trim(regexp_replace(file_name, '\.pdf$', '', 'i')), ''),
    'Untitled Drawing Set'
  ),
  120
)
where display_name is null
  or char_length(trim(display_name)) = 0
  or char_length(display_name) > 120;

with ordered_drawings as (
  select
    id,
    row_number() over (
      partition by organization_id, project_id
      order by uploaded_at asc, created_at asc, id asc
    ) - 1 as next_sort_order
  from public.project_drawing_sets
)
update public.project_drawing_sets drawing_set
set sort_order = ordered_drawings.next_sort_order
from ordered_drawings
where drawing_set.id = ordered_drawings.id
  and drawing_set.sort_order is null;

update public.project_drawing_sets
set source_type = case
  when upper(file_name) like '%TRADE PACK%'
    or upper(storage_path) like '%-TRADE-PACK.PDF%'
    then 'generated_trade_pack'
  else 'source'
end
where source_type is null;

update public.project_drawing_sets drawing_set
set source_revision = coalesce(
  (
    select nullif(trim(page.source_revision), '')
    from public.takeoff_pages page
    where page.organization_id = drawing_set.organization_id
      and page.project_id = drawing_set.project_id
      and page.drawing_set_id = drawing_set.id
    order by page.created_at desc, page.id desc
    limit 1
  ),
  coalesce(drawing_set.updated_at, drawing_set.created_at)::text
)
where drawing_set.source_revision is null or char_length(trim(drawing_set.source_revision)) = 0;

alter table public.project_drawing_sets
  alter column display_name set default 'Untitled Drawing Set';

alter table public.project_drawing_sets
  alter column display_name set not null;

alter table public.project_drawing_sets
  alter column sort_order set default -1;

alter table public.project_drawing_sets
  alter column sort_order set not null;

alter table public.project_drawing_sets
  alter column source_type set default 'source';

alter table public.project_drawing_sets
  alter column source_type set not null;

alter table public.project_drawing_sets
  alter column source_revision set default gen_random_uuid()::text;

alter table public.project_drawing_sets
  alter column source_revision set not null;

alter table public.project_drawing_sets
  drop constraint if exists project_drawing_sets_display_name_not_blank;

alter table public.project_drawing_sets
  add constraint project_drawing_sets_display_name_not_blank
  check (char_length(trim(display_name)) > 0 and char_length(display_name) <= 120);

alter table public.project_drawing_sets
  drop constraint if exists project_drawing_sets_sort_order_nonnegative;

alter table public.project_drawing_sets
  add constraint project_drawing_sets_sort_order_nonnegative
  check (sort_order >= 0);

alter table public.project_drawing_sets
  drop constraint if exists project_drawing_sets_source_type_valid;

alter table public.project_drawing_sets
  add constraint project_drawing_sets_source_type_valid
  check (source_type in ('source', 'generated_trade_pack'));

alter table public.project_drawing_sets
  drop constraint if exists project_drawing_sets_source_revision_not_blank;

alter table public.project_drawing_sets
  add constraint project_drawing_sets_source_revision_not_blank
  check (char_length(trim(source_revision)) > 0);

create unique index if not exists project_drawing_sets_project_sort_order_idx
  on public.project_drawing_sets (organization_id, project_id, sort_order);

create index if not exists project_drawing_sets_takeoff_tabs_idx
  on public.project_drawing_sets (
    organization_id,
    project_id,
    source_type,
    archived_at,
    sort_order,
    created_at
  );

create or replace function public.assign_project_drawing_set_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sort_order is null or new.sort_order < 0 then
    perform pg_advisory_xact_lock(
      hashtextextended(new.organization_id::text || ':' || new.project_id::text, 0)
    );

    select coalesce(max(existing.sort_order), -1) + 1
    into new.sort_order
    from public.project_drawing_sets existing
    where existing.organization_id = new.organization_id
      and existing.project_id = new.project_id;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_project_drawing_set_sort_order on public.project_drawing_sets;
create trigger assign_project_drawing_set_sort_order
before insert on public.project_drawing_sets
for each row execute function public.assign_project_drawing_set_sort_order();

grant update (display_name, sort_order) on public.project_drawing_sets to authenticated;

create or replace function public.validate_takeoff_render_job_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  drawing_set_row public.project_drawing_sets%rowtype;
begin
  select *
  into drawing_set_row
  from public.project_drawing_sets
  where id = new.drawing_set_id;

  if drawing_set_row.id is null then
    raise exception 'Takeoff render job drawing set does not exist.';
  end if;

  if drawing_set_row.organization_id <> new.organization_id then
    raise exception 'Takeoff render job organization_id must match drawing set organization_id.';
  end if;

  if drawing_set_row.project_id <> new.project_id then
    raise exception 'Takeoff render job project_id must match drawing set project_id.';
  end if;

  if not public.takeoff_opportunity_matches_project(new.organization_id, new.project_id, new.opportunity_id) then
    raise exception 'Takeoff render job opportunity_id must match project_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_takeoff_render_job_consistency on public.takeoff_render_jobs;
create trigger validate_takeoff_render_job_consistency
before insert or update on public.takeoff_render_jobs
for each row execute function public.validate_takeoff_render_job_consistency();
