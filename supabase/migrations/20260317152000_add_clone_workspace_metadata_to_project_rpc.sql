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
    raise exception 'Unauthorized';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_target_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Target project not found for organization';
  end if;

  if coalesce(jsonb_typeof(p_drawing_sets), 'null') = 'array' and jsonb_array_length(p_drawing_sets) > 0 then
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
    on conflict (id) do nothing;
  end if;

  if coalesce(jsonb_typeof(p_trade_packs), 'null') = 'array' and jsonb_array_length(p_trade_packs) > 0 then
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
    on conflict (id) do nothing;
  end if;

  if coalesce(jsonb_typeof(p_scope_runs), 'null') = 'array' and jsonb_array_length(p_scope_runs) > 0 then
    insert into public.scope_runs (
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
      organization_id uuid,
      project_id uuid,
      trade_pack_id uuid,
      created_by uuid,
      status text,
      result_json jsonb,
      error_message text,
      created_at timestamptz,
      updated_at timestamptz
    );
  end if;
end;
$$;

grant execute on function public.clone_workspace_metadata_to_project(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
