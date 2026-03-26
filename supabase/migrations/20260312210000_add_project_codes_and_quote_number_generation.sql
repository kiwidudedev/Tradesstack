alter table public.organization_projects
add column if not exists project_code text;

create or replace function public.generate_project_code(
  p_organization_id uuid,
  p_created_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  year_prefix text;
  next_sequence integer;
begin
  year_prefix := to_char(coalesce(p_created_at, now()) at time zone 'utc', 'YY');

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || year_prefix));

  select coalesce(max(substring(project_code from 3)::integer), 0) + 1
  into next_sequence
  from public.organization_projects
  where organization_id = p_organization_id
    and project_code like (year_prefix || '%')
    and project_code ~ '^[0-9]{5,}$';

  return year_prefix || lpad(next_sequence::text, 3, '0');
end;
$$;

create or replace function public.assign_project_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_code is null or btrim(new.project_code) = '' then
    new.project_code := public.generate_project_code(new.organization_id, coalesce(new.created_at, now()));
  end if;

  return new;
end;
$$;

update public.organization_projects p
set project_code = generated.project_code
from (
  with existing_max as (
    select
      organization_id,
      to_char(created_at at time zone 'utc', 'YY') as year_prefix,
      coalesce(max(substring(project_code from 3)::integer), 0) as max_sequence
    from public.organization_projects
    where project_code ~ '^[0-9]{5,}$'
    group by organization_id, to_char(created_at at time zone 'utc', 'YY')
  ),
  rows_missing_code as (
    select
      id,
      organization_id,
      to_char(created_at at time zone 'utc', 'YY') as year_prefix,
      row_number() over (
        partition by organization_id, to_char(created_at at time zone 'utc', 'YY')
        order by created_at, id
      ) as sequence_in_year
    from public.organization_projects
    where project_code is null or btrim(project_code) = ''
  )
  select
    missing.id,
    missing.year_prefix || lpad((coalesce(existing_max.max_sequence, 0) + missing.sequence_in_year)::text, 3, '0') as project_code
  from rows_missing_code missing
  left join existing_max
    on existing_max.organization_id = missing.organization_id
   and existing_max.year_prefix = missing.year_prefix
) as generated
where p.id = generated.id;

alter table public.organization_projects
alter column project_code set not null;

drop trigger if exists set_organization_projects_project_code on public.organization_projects;
create trigger set_organization_projects_project_code
before insert on public.organization_projects
for each row
execute function public.assign_project_code();

create unique index if not exists organization_projects_org_project_code_unique_idx
on public.organization_projects (organization_id, project_code);

create or replace function public.generate_project_quote_number(
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
  select project_code
  into resolved_project_code
  from public.organization_projects
  where id = p_project_id
    and organization_id = p_organization_id;

  if resolved_project_code is null then
    raise exception 'Could not resolve project code for quote numbering';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':quote:' || resolved_project_code));

  select coalesce(max(substring(quote_number from ('^Q-' || resolved_project_code || '-([0-9]+)$'))::integer), 0) + 1
  into next_sequence
  from public.project_quotes
  where organization_id = p_organization_id
    and quote_number like ('Q-' || resolved_project_code || '-%');

  return format('Q-%s-%s', resolved_project_code, next_sequence);
end;
$$;

create or replace function public.assign_project_quote_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    new.quote_number := public.generate_project_quote_number(new.organization_id, new.project_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_project_quotes_quote_number on public.project_quotes;
create trigger set_project_quotes_quote_number
before insert on public.project_quotes
for each row
execute function public.assign_project_quote_number();
