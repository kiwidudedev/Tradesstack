begin;

-- Relational source links are the authority for worksheet-backed quote lines.
-- This report remains read-only and can be run before/after reconciliation.
create or replace function public.report_project_quote_line_pricing_source_kind_mismatches(
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  quote_id uuid,
  quote_line_id uuid,
  recorded_source_kind text,
  evidence_source_kind text,
  quote_status text,
  award_locked boolean,
  award_classification text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    line.organization_id,
    line.quote_id,
    line.id,
    line.pricing_source_kind,
    'worksheet'::text,
    quote.status,
    quote.award_locked_at is not null,
    manifest.classification
  from public.project_quote_line_items line
  join public.project_quotes quote
    on quote.organization_id = line.organization_id
   and quote.id = line.quote_id
  left join public.opportunity_award_pricing_manifests manifest
    on manifest.organization_id = line.organization_id
   and manifest.accepted_quote_id = line.quote_id
  where (p_organization_id is null or line.organization_id = p_organization_id)
    and line.pricing_source_kind <> 'worksheet'
    and exists (
      select 1
      from public.commercial_item_document_links link
      where link.organization_id = line.organization_id
        and link.document_kind = 'quote_line'
        and link.link_role = 'source'
        and link.document_id = line.quote_id
        and link.document_line_id = line.id
    )
  order by line.organization_id, line.quote_id, line.id;
$$;

revoke all on function public.report_project_quote_line_pricing_source_kind_mismatches(uuid)
  from public, anon;
grant execute on function public.report_project_quote_line_pricing_source_kind_mismatches(uuid)
  to authenticated, service_role;

-- Preserve award immutability while allowing exactly one deterministic metadata
-- repair: source-link evidence may correct pricing_source_kind to worksheet.
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
    and new.pricing_source_kind = 'worksheet'
    and (to_jsonb(new) - 'pricing_source_kind' - 'updated_at')
      = (to_jsonb(old) - 'pricing_source_kind' - 'updated_at')
    and exists (
      select 1
      from public.commercial_item_document_links link
      where link.organization_id = new.organization_id
        and link.document_kind = 'quote_line'
        and link.link_role = 'source'
        and link.document_id = new.quote_id
        and link.document_line_id = new.id
    )
  then
    return new;
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

create or replace function public.enforce_quote_line_pricing_source_kind_from_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Nested updates from sync_quote_line_pricing_source_kind must retain their
  -- explicit DELETE behaviour while the source link is still visible.
  if pg_trigger_depth() = 1 and exists (
    select 1
    from public.commercial_item_document_links link
    where link.organization_id = new.organization_id
      and link.document_kind = 'quote_line'
      and link.link_role = 'source'
      and link.document_id = new.quote_id
      and link.document_line_id = new.id
  ) then
    new.pricing_source_kind := 'worksheet';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_quote_line_pricing_source_kind_from_evidence
  on public.project_quote_line_items;
create trigger enforce_quote_line_pricing_source_kind_from_evidence
before insert or update on public.project_quote_line_items
for each row execute function public.enforce_quote_line_pricing_source_kind_from_evidence();

do $$
declare
  mismatch_count integer;
begin
  select count(*)::integer into mismatch_count
  from public.report_project_quote_line_pricing_source_kind_mismatches(null);
  raise notice 'pricing_source_kind reconciliation dry-run: % worksheet-backed mismatches', mismatch_count;
end;
$$;

update public.project_quote_line_items line
set pricing_source_kind = 'worksheet'
where line.pricing_source_kind <> 'worksheet'
  and exists (
    select 1
    from public.commercial_item_document_links link
    where link.organization_id = line.organization_id
      and link.document_kind = 'quote_line'
      and link.link_role = 'source'
      and link.document_id = line.quote_id
      and link.document_line_id = line.id
  );

commit;
