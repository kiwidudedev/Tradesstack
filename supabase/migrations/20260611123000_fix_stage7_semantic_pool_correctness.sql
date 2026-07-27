create or replace function public.replace_worksheet_memory_semantic_pool_events(
  p_semantic_pool_id uuid,
  p_organization_id uuid,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  input_item jsonb;
  inserted_ids jsonb := '[]'::jsonb;
  inserted_id uuid;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'replace_worksheet_memory_semantic_pool_events requires a JSON array payload';
  end if;

  delete from public.worksheet_memory_semantic_pool_events
  where semantic_pool_id = p_semantic_pool_id
    and organization_id = p_organization_id;

  for input_item in
    select value
    from jsonb_array_elements(p_records)
  loop
    insert into public.worksheet_memory_semantic_pool_events (
      semantic_pool_id,
      organization_id,
      source_event_id,
      classification_record_id,
      evidence_role,
      linked_by_run_id
    )
    values (
      p_semantic_pool_id,
      p_organization_id,
      nullif(input_item->>'source_event_id', '')::uuid,
      nullif(input_item->>'classification_record_id', '')::uuid,
      coalesce(nullif(btrim(coalesce(input_item->>'evidence_role', '')), ''), 'excluded'),
      nullif(input_item->>'linked_by_run_id', '')::uuid
    )
    returning id into inserted_id;

    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

grant execute on function public.replace_worksheet_memory_semantic_pool_events(uuid, uuid, jsonb) to service_role;
