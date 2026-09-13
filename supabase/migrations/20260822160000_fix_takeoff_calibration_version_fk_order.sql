create or replace function public.save_takeoff_calibration_fast(
  arg_id uuid,
  arg_organization_id uuid,
  arg_project_id uuid,
  arg_opportunity_id uuid,
  arg_page_id uuid,
  arg_name text,
  arg_scale_ratio numeric,
  arg_unit_system text,
  arg_base_unit text,
  arg_display_unit text,
  arg_reference_length_input numeric,
  arg_reference_length_base numeric,
  arg_point_a_x numeric,
  arg_point_a_y numeric,
  arg_point_b_x numeric,
  arg_point_b_y numeric,
  arg_notes text,
  arg_created_by uuid
)
returns public.takeoff_calibrations
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous_active_ids uuid[] := '{}';
  calibration_row public.takeoff_calibrations%rowtype;
begin
  previous_active_ids := coalesce(
    array(
      select id
      from public.takeoff_calibrations
      where organization_id = arg_organization_id
        and project_id = arg_project_id
        and opportunity_id = arg_opportunity_id
        and page_id = arg_page_id
        and is_active = true
      for update
    ),
    '{}'
  );

  if coalesce(array_length(previous_active_ids, 1), 0) > 0 then
    update public.takeoff_calibrations
    set
      is_active = false,
      superseded_by = null
    where id = any(previous_active_ids);
  end if;

  insert into public.takeoff_calibrations (
    id,
    organization_id,
    project_id,
    opportunity_id,
    page_id,
    name,
    scale_ratio,
    unit_system,
    base_unit,
    display_unit,
    reference_length_input,
    reference_length_base,
    point_a_x,
    point_a_y,
    point_b_x,
    point_b_y,
    is_active,
    superseded_by,
    notes,
    metadata,
    created_by
  )
  values (
    arg_id,
    arg_organization_id,
    arg_project_id,
    arg_opportunity_id,
    arg_page_id,
    arg_name,
    arg_scale_ratio,
    arg_unit_system,
    arg_base_unit,
    arg_display_unit,
    arg_reference_length_input,
    arg_reference_length_base,
    arg_point_a_x,
    arg_point_a_y,
    arg_point_b_x,
    arg_point_b_y,
    true,
    null,
    coalesce(arg_notes, ''),
    '{}'::jsonb,
    arg_created_by
  )
  returning * into calibration_row;

  if coalesce(array_length(previous_active_ids, 1), 0) > 0 then
    update public.takeoff_calibrations
    set superseded_by = arg_id
    where id = any(previous_active_ids);
  end if;

  return calibration_row;
exception
  when others then
    if coalesce(array_length(previous_active_ids, 1), 0) > 0 then
      update public.takeoff_calibrations
      set
        is_active = true,
        superseded_by = null
      where id = any(previous_active_ids);
    end if;

    raise;
end;
$$;

grant execute on function public.save_takeoff_calibration_fast(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  uuid
) to authenticated;
