create table if not exists public.takeoff_data_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_version text not null,
  repair_kind text not null,
  calibration_id uuid not null references public.takeoff_calibrations(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.organization_projects(id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities(id) on delete set null,
  page_id uuid not null references public.takeoff_pages(id) on delete cascade,
  reason text not null,
  before_data jsonb not null,
  after_data jsonb not null,
  repaired_at timestamptz not null default now(),
  repaired_by text not null default current_user
);

alter table public.takeoff_data_repair_audit enable row level security;
revoke all on public.takeoff_data_repair_audit from anon, authenticated;
grant select, insert on public.takeoff_data_repair_audit to service_role;

create or replace function public.repair_takeoff_calibration_unit_integrity(
  arg_calibration_id uuid,
  arg_expected_updated_at timestamptz,
  arg_intended_display_unit text,
  arg_reference_length_base numeric,
  arg_scale_ratio numeric,
  arg_measurement_repairs jsonb,
  arg_reason text,
  arg_repair_version text,
  arg_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  calibration_row public.takeoff_calibrations%rowtype;
  measurement_repair jsonb;
  shape_repair jsonb;
  path_repair jsonb;
  dependent_ids uuid[];
  proposed_ids uuid[];
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Takeoff unit repair requires the service role.';
  end if;

  if arg_intended_display_unit not in ('mm', 'cm', 'm', 'in', 'ft') then
    raise exception 'Unsupported intended calibration display unit.';
  end if;
  if arg_reference_length_base <= 0 or arg_scale_ratio <= 0 then
    raise exception 'Repaired calibration values must be positive.';
  end if;
  if jsonb_typeof(arg_measurement_repairs) <> 'array' then
    raise exception 'Measurement repairs must be a JSON array.';
  end if;
  if nullif(btrim(arg_reason), '') is null or nullif(btrim(arg_repair_version), '') is null then
    raise exception 'Repair reason and version are required.';
  end if;

  select * into calibration_row
  from public.takeoff_calibrations
  where id = arg_calibration_id
  for update;

  if calibration_row.id is null then
    raise exception 'Allowlisted calibration does not exist.';
  end if;
  if calibration_row.updated_at <> arg_expected_updated_at then
    raise exception 'Calibration changed after dry-run; generate a new report.';
  end if;
  if (calibration_row.unit_system = 'metric' and arg_intended_display_unit not in ('mm', 'cm', 'm'))
     or (calibration_row.unit_system = 'imperial' and arg_intended_display_unit not in ('in', 'ft')) then
    raise exception 'Intended unit does not match the stored unit system.';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[]) into dependent_ids
  from public.takeoff_measurements
  where calibration_id = arg_calibration_id;

  select coalesce(array_agg((item->>'id')::uuid order by (item->>'id')::uuid), '{}'::uuid[])
  into proposed_ids
  from jsonb_array_elements(arg_measurement_repairs) item;

  if dependent_ids <> proposed_ids then
    raise exception 'Repair payload must include every dependent measurement exactly once.';
  end if;

  select jsonb_build_object(
    'calibration', to_jsonb(calibration_row),
    'measurements', coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
  ) into before_snapshot
  from public.takeoff_measurements m
  where m.calibration_id = arg_calibration_id;

  after_snapshot := jsonb_build_object(
    'calibration', to_jsonb(calibration_row) || jsonb_build_object(
      'display_unit', arg_intended_display_unit,
      'reference_length_base', arg_reference_length_base,
      'scale_ratio', arg_scale_ratio
    ),
    'measurements', arg_measurement_repairs
  );

  if arg_dry_run then
    return jsonb_build_object(
      'dryRun', true,
      'calibrationId', arg_calibration_id,
      'dependentMeasurementCount', cardinality(dependent_ids),
      'before', before_snapshot,
      'after', after_snapshot
    );
  end if;

  update public.takeoff_calibrations
  set display_unit = arg_intended_display_unit,
      reference_length_base = arg_reference_length_base,
      scale_ratio = arg_scale_ratio
  where id = arg_calibration_id;

  for measurement_repair in select value from jsonb_array_elements(arg_measurement_repairs)
  loop
    update public.takeoff_measurements
    set measured_length_base = nullif(measurement_repair->>'measured_length_base', '')::numeric,
        measured_area_base = nullif(measurement_repair->>'measured_area_base', '')::numeric,
        measured_perimeter_base = nullif(measurement_repair->>'measured_perimeter_base', '')::numeric,
        display_value = nullif(measurement_repair->>'display_value', '')::numeric,
        display_unit = measurement_repair->>'display_unit'
    where id = (measurement_repair->>'id')::uuid
      and calibration_id = arg_calibration_id;

    if not found then
      raise exception 'Dependent measurement changed during repair.';
    end if;

    for shape_repair in select value from jsonb_array_elements(coalesce(measurement_repair->'area_shapes', '[]'::jsonb))
    loop
      update public.takeoff_measurement_area_shapes
      set measured_area_base = (shape_repair->>'measured_area_base')::numeric,
          measured_perimeter_base = (shape_repair->>'measured_perimeter_base')::numeric
      where id = (shape_repair->>'id')::uuid
        and measurement_id = (measurement_repair->>'id')::uuid;
      if not found then raise exception 'Dependent area shape changed during repair.'; end if;
    end loop;

    for path_repair in select value from jsonb_array_elements(coalesce(measurement_repair->'line_paths', '[]'::jsonb))
    loop
      update public.takeoff_measurement_line_paths
      set measured_length_base = (path_repair->>'measured_length_base')::numeric
      where id = (path_repair->>'id')::uuid
        and measurement_id = (measurement_repair->>'id')::uuid;
      if not found then raise exception 'Dependent line path changed during repair.'; end if;
    end loop;
  end loop;

  insert into public.takeoff_data_repair_audit (
    repair_version, repair_kind, calibration_id, organization_id, project_id,
    opportunity_id, page_id, reason, before_data, after_data
  ) values (
    arg_repair_version, 'takeoff_calibration_unit_integrity', calibration_row.id,
    calibration_row.organization_id, calibration_row.project_id, calibration_row.opportunity_id,
    calibration_row.page_id, btrim(arg_reason), before_snapshot, after_snapshot
  );

  return jsonb_build_object(
    'dryRun', false,
    'calibrationId', arg_calibration_id,
    'dependentMeasurementCount', cardinality(dependent_ids),
    'auditRecorded', true,
    'before', before_snapshot,
    'after', after_snapshot
  );
end;
$$;

revoke all on function public.repair_takeoff_calibration_unit_integrity(
  uuid, timestamptz, text, numeric, numeric, jsonb, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.repair_takeoff_calibration_unit_integrity(
  uuid, timestamptz, text, numeric, numeric, jsonb, text, text, boolean
) to service_role;
