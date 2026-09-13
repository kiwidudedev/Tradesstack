-- Clean same-Project promotion metadata without changing Project identity.

create table if not exists public.organization_project_slug_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  alias_slug text not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users (id) on delete set null,
  reason text not null default 'same_project_promotion',
  constraint organization_project_slug_aliases_project_fk
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id) on delete restrict,
  constraint organization_project_slug_aliases_slug_not_blank
    check (char_length(btrim(alias_slug)) > 0)
);

create unique index if not exists organization_project_slug_aliases_org_slug_uidx
  on public.organization_project_slug_aliases (organization_id, lower(alias_slug));

create index if not exists organization_project_slug_aliases_project_idx
  on public.organization_project_slug_aliases (organization_id, project_id);

alter table public.organization_project_slug_aliases enable row level security;
alter table public.organization_project_slug_aliases force row level security;

drop policy if exists "Members can resolve Project slug aliases"
  on public.organization_project_slug_aliases;
create policy "Members can resolve Project slug aliases"
  on public.organization_project_slug_aliases for select
  using (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = organization_project_slug_aliases.organization_id
        and member.user_id = auth.uid()
    )
  );

revoke all on public.organization_project_slug_aliases from public, anon;
grant select on public.organization_project_slug_aliases to authenticated;

create or replace function public.guard_project_slug_namespace_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid := new.organization_id;
  resolved_slug text := case
    when tg_table_name = 'organization_projects' then to_jsonb(new) ->> 'slug'
    else to_jsonb(new) ->> 'alias_slug'
  end;
  resolved_project_id uuid;
begin
  if tg_table_name = 'organization_projects' then
    resolved_project_id := new.id;
  else
    resolved_project_id := (to_jsonb(new) ->> 'project_id')::uuid;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(resolved_organization_id::text || ':project-slug-namespace', 0)
  );

  if tg_table_name = 'organization_projects' then
    if exists (
      select 1 from public.organization_project_slug_aliases alias
      where alias.organization_id = resolved_organization_id
        and lower(alias.alias_slug) = lower(resolved_slug)
        and alias.project_id <> resolved_project_id
    ) then
      raise exception 'Project slug conflicts with a stored Project slug alias'
        using errcode = '23505';
    end if;
  elsif exists (
    select 1 from public.organization_projects project
    where project.organization_id = resolved_organization_id
      and lower(project.slug) = lower(resolved_slug)
      and project.id <> resolved_project_id
  ) then
    raise exception 'Project slug alias conflicts with an active Project slug'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_organization_projects_slug_namespace
  on public.organization_projects;
create trigger guard_organization_projects_slug_namespace
before insert or update of organization_id, slug on public.organization_projects
for each row execute function public.guard_project_slug_namespace_v1();

drop trigger if exists guard_project_slug_alias_namespace
  on public.organization_project_slug_aliases;
create trigger guard_project_slug_alias_namespace
before insert on public.organization_project_slug_aliases
for each row execute function public.guard_project_slug_namespace_v1();

revoke all on function public.guard_project_slug_namespace_v1()
  from public, anon, authenticated;

create or replace function public.prevent_project_slug_alias_mutation_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Project slug aliases are immutable' using errcode = 'TS409';
end;
$$;

drop trigger if exists prevent_project_slug_alias_mutation
  on public.organization_project_slug_aliases;
create trigger prevent_project_slug_alias_mutation
before update or delete on public.organization_project_slug_aliases
for each row execute function public.prevent_project_slug_alias_mutation_v1();

revoke all on function public.prevent_project_slug_alias_mutation_v1()
  from public, anon, authenticated;

create or replace function public.clean_same_project_promotion_metadata_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  project_row public.organization_projects%rowtype;
  base_slug text;
  candidate_slug text;
  suffix integer := 2;
begin
  if new.strategy <> 'promote_workspace_v1' or new.strategy_version <> 1 then
    return new;
  end if;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = new.opportunity_id
    and opportunity.organization_id = new.organization_id;

  select * into project_row
  from public.organization_projects project
  where project.id = new.project_id
    and project.organization_id = new.organization_id
  for update;

  if not found
    or opportunity_row.workspace_project_id is distinct from project_row.id
    or opportunity_row.converted_project_id is distinct from project_row.id
    or project_row.source_opportunity_id is distinct from opportunity_row.id
    or not exists (
      select 1 from public.opportunity_final_projects final_project
      where final_project.organization_id = new.organization_id
        and final_project.opportunity_id = opportunity_row.id
        and final_project.project_id = project_row.id
        and final_project.accepted_quote_id = new.accepted_quote_id
    )
  then
    raise exception 'Promotion metadata cleanup requires consistent same-Project evidence'
      using errcode = 'TS409';
  end if;

  base_slug := coalesce(
    nullif(btrim(opportunity_row.slug), ''),
    nullif(regexp_replace(
      regexp_replace(lower(btrim(opportunity_row.name)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ), ''),
    'project'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text || ':project-slug-namespace', 0)
  );

  candidate_slug := base_slug;
  while exists (
    select 1 from public.organization_projects project
    where project.organization_id = new.organization_id
      and project.id <> project_row.id
      and lower(project.slug) = lower(candidate_slug)
  ) or exists (
    select 1 from public.organization_project_slug_aliases alias
    where alias.organization_id = new.organization_id
      and alias.project_id <> project_row.id
      and lower(alias.alias_slug) = lower(candidate_slug)
  ) loop
    candidate_slug := base_slug || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  if lower(project_row.slug) <> lower(candidate_slug) then
    insert into public.organization_project_slug_aliases (
      organization_id, project_id, alias_slug, created_by, reason
    ) values (
      new.organization_id, project_row.id, project_row.slug, new.completed_by,
      'same_project_promotion'
    ) on conflict (organization_id, lower(alias_slug)) do nothing;
  end if;

  update public.organization_projects project
  set name = case
        when project.name = opportunity_row.name || ' Tender Workspace'
          then opportunity_row.name
        else project.name
      end,
      slug = candidate_slug
  where project.id = project_row.id
    and project.organization_id = new.organization_id;

  return new;
end;
$$;

drop trigger if exists clean_same_project_promotion_metadata
  on public.opportunity_promotion_events;
create trigger clean_same_project_promotion_metadata
before insert on public.opportunity_promotion_events
for each row execute function public.clean_same_project_promotion_metadata_v1();

revoke all on function public.clean_same_project_promotion_metadata_v1()
  from public, anon, authenticated;

-- Keep the established promotion implementation as the core transaction and
-- replace its public entry point with a wrapper that returns the post-trigger
-- canonical slug on both the first call and retries.
alter function public.promote_opportunity_workspace_v1(uuid, uuid, uuid, uuid)
  rename to promote_opportunity_workspace_core_v1;

revoke all on function public.promote_opportunity_workspace_core_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

create function public.promote_opportunity_workspace_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id uuid
)
returns table (
  project_id uuid,
  project_slug text,
  accepted_quote_id uuid,
  promotion_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select promoted.project_id,
         project.slug,
         promoted.accepted_quote_id,
         promoted.promotion_completed
  from public.promote_opportunity_workspace_core_v1(
    p_organization_id,
    p_opportunity_id,
    p_accepted_quote_id,
    p_correlation_id
  ) promoted
  join public.organization_projects project
    on project.id = promoted.project_id
   and project.organization_id = p_organization_id;
end;
$$;

revoke all on function public.promote_opportunity_workspace_v1(
  uuid, uuid, uuid, uuid
) from public, anon;
grant execute on function public.promote_opportunity_workspace_v1(
  uuid, uuid, uuid, uuid
) to authenticated;

create or replace function public.resolve_project_slug_alias_v1(
  p_organization_id uuid,
  p_alias_slug text
)
returns table (project_id uuid, canonical_slug text)
language sql
stable
security invoker
set search_path = public
as $$
  select project.id, project.slug
  from public.organization_project_slug_aliases alias
  join public.organization_projects project
    on project.organization_id = alias.organization_id
   and project.id = alias.project_id
  where alias.organization_id = p_organization_id
    and lower(alias.alias_slug) = lower(btrim(p_alias_slug))
    and lower(project.slug) <> lower(alias.alias_slug)
  limit 1;
$$;

revoke all on function public.resolve_project_slug_alias_v1(uuid, text)
  from public, anon;
grant execute on function public.resolve_project_slug_alias_v1(uuid, text)
  to authenticated;

comment on table public.organization_project_slug_aliases is
  'Immutable organization-scoped history for canonical Project slug redirects.';
comment on function public.promote_opportunity_workspace_v1(uuid, uuid, uuid, uuid) is
  'Atomically promotes W in place and returns its cleaned canonical metadata.';
