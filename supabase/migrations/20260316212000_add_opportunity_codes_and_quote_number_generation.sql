alter table public.organization_opportunities
add column if not exists opportunity_code text;

create or replace function public.generate_opportunity_code(
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

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':opp:' || year_prefix));

  select coalesce(max(substring(opportunity_code from 3)::integer), 0) + 1
  into next_sequence
  from public.organization_opportunities
  where organization_id = p_organization_id
    and opportunity_code like (year_prefix || '%')
    and opportunity_code ~ '^[0-9]{5,}$';

  return year_prefix || lpad(next_sequence::text, 3, '0');
end;
$$;

create or replace function public.assign_opportunity_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.opportunity_code is null or btrim(new.opportunity_code) = '' then
    new.opportunity_code := public.generate_opportunity_code(new.organization_id, coalesce(new.created_at, now()));
  end if;

  return new;
end;
$$;

update public.organization_opportunities o
set opportunity_code = generated.opportunity_code
from (
  with existing_max as (
    select
      organization_id,
      to_char(created_at at time zone 'utc', 'YY') as year_prefix,
      coalesce(max(substring(opportunity_code from 3)::integer), 0) as max_sequence
    from public.organization_opportunities
    where opportunity_code ~ '^[0-9]{5,}$'
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
    from public.organization_opportunities
    where opportunity_code is null or btrim(opportunity_code) = ''
  )
  select
    missing.id,
    missing.year_prefix || lpad((coalesce(existing_max.max_sequence, 0) + missing.sequence_in_year)::text, 3, '0') as opportunity_code
  from rows_missing_code missing
  left join existing_max
    on existing_max.organization_id = missing.organization_id
   and existing_max.year_prefix = missing.year_prefix
) as generated
where o.id = generated.id;

alter table public.organization_opportunities
alter column opportunity_code set not null;

drop trigger if exists set_organization_opportunities_code on public.organization_opportunities;
create trigger set_organization_opportunities_code
before insert on public.organization_opportunities
for each row
execute function public.assign_opportunity_code();

create unique index if not exists organization_opportunities_org_code_unique_idx
on public.organization_opportunities (organization_id, opportunity_code);

create or replace function public.generate_opportunity_quote_number(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_opportunity_code text;
  next_sequence integer;
begin
  select opportunity_code
  into resolved_opportunity_code
  from public.organization_opportunities
  where id = p_opportunity_id
    and organization_id = p_organization_id;

  if resolved_opportunity_code is null then
    raise exception 'Could not resolve opportunity code for quote numbering';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':quote:' || resolved_opportunity_code));

  select coalesce(max(substring(quote_number from ('^Q-' || resolved_opportunity_code || '-([0-9]+)$'))::integer), 0) + 1
  into next_sequence
  from public.opportunity_quotes
  where organization_id = p_organization_id
    and quote_number like ('Q-' || resolved_opportunity_code || '-%');

  return format('Q-%s-%s', resolved_opportunity_code, next_sequence);
end;
$$;

create or replace function public.assign_opportunity_quote_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    new.quote_number := public.generate_opportunity_quote_number(new.organization_id, new.opportunity_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_opportunity_quotes_quote_number on public.opportunity_quotes;
create trigger set_opportunity_quotes_quote_number
before insert on public.opportunity_quotes
for each row
execute function public.assign_opportunity_quote_number();
