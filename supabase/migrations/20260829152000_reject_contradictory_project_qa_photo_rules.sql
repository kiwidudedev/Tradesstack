begin;

create or replace function public.guard_project_qa_operational_definition_v1()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='active' and old.status='draft' then
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.block_completion_on_fail) then raise exception 'Disable the legacy Block Completion on Fail setting before making this QA Ready' using errcode='TS422'; end if;
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.field_type='photo' and field.required and field.minimum_photos<1) then raise exception 'Required Photo fields need at least one photo' using errcode='TS422'; end if;
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.field_type='inspection_check' and field.photo_required and field.require_photo_on_fail) then raise exception 'Inspection photo evidence cannot be both Required and Required on Fail' using errcode='TS422'; end if;
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.field_type='measurement' and ((nullif(field.configuration->>'target','') is null)<>(nullif(field.configuration->>'tolerance','') is null))) then raise exception 'Measurement Target and Tolerance must be configured together' using errcode='TS422'; end if;
  end if;
  return new;
end; $$;

commit;
