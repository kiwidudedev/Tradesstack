alter table public.organization_memory_links
  drop constraint if exists organization_memory_links_link_type_check;

alter table public.organization_memory_links
  add constraint organization_memory_links_link_type_check check (
    link_type in ('seed', 'supporting', 'confirmation', 'contradiction', 'supersession', 'uncertain', 'adjacent', 'excluded')
  );

create or replace function public.replace_organization_memory_provenance_links(
  p_organization_memory_item_id uuid,
  p_organization_id uuid,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_ids jsonb := '[]'::jsonb;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'replace_organization_memory_provenance_links requires a JSON array payload';
  end if;

  perform public._organization_memory_assert_item_in_organization(
    p_memory_item_id := p_organization_memory_item_id,
    p_organization_id := p_organization_id
  );

  delete from public.organization_memory_links
  where organization_memory_item_id = p_organization_memory_item_id
    and organization_id = p_organization_id
    and (
      source_event_id is not null
      or (
        source_entity_type in ('worksheet_memory_semantic_pool', 'worksheet_event_classification', 'organization_memory_item')
        and link_type in ('seed', 'supporting', 'contradiction', 'supersession', 'uncertain', 'adjacent', 'excluded')
      )
    );

  if jsonb_array_length(p_records) = 0 then
    return jsonb_build_object(
      'count', 0,
      'ids', '[]'::jsonb
    );
  end if;

  with inserted as (
    insert into public.organization_memory_links (
      organization_memory_item_id,
      organization_id,
      link_type,
      source_event_id,
      source_entity_type,
      source_entity_id,
      weight,
      confidence_delta,
      note
    )
    select
      p_organization_memory_item_id,
      p_organization_id,
      coalesce(nullif(trim(record->>'link_type'), ''), 'supporting'),
      nullif(record->>'source_event_id', '')::uuid,
      nullif(record->>'source_entity_type', ''),
      nullif(record->>'source_entity_id', '')::uuid,
      coalesce(nullif(record->>'weight', '')::numeric, 1),
      nullif(record->>'confidence_delta', '')::numeric,
      nullif(record->>'note', '')
    from jsonb_array_elements(p_records) as record
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb)
  into inserted_ids
  from inserted;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

grant execute on function public.replace_organization_memory_provenance_links(uuid, uuid, jsonb) to service_role;
