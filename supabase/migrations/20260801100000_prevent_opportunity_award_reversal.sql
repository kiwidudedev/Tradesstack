-- Stage 3 completion: an authoritative final mapping makes ordinary award
-- reversal fail closed. Historical conversion and direct Projects are unchanged.
create or replace function public.prevent_opportunity_award_reversal_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  mapped_project_id uuid;
begin
  -- Trusted SQL maintenance and reconciliation must remain capable of
  -- representing existing historical anomalies. Ordinary authenticated
  -- application writes always have auth.uid() and are guarded below.
  if auth.uid() is null then
    return new;
  end if;

  if new.stage is not distinct from old.stage
    and new.converted_project_id is not distinct from old.converted_project_id
    and new.converted_at is not distinct from old.converted_at
  then
    return new;
  end if;

  select final_project.project_id
  into mapped_project_id
  from public.opportunity_final_projects final_project
  where final_project.organization_id = old.organization_id
    and final_project.opportunity_id = old.id;

  if mapped_project_id is not null
    and (
      new.stage is distinct from 'Won'
      or new.converted_project_id is distinct from mapped_project_id
      or new.converted_at is null
    )
  then
    raise exception 'Awarded Opportunities cannot be reversed through an ordinary update'
      using errcode = 'TS409';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_opportunity_award_reversal_v1
on public.organization_opportunities;
create trigger prevent_opportunity_award_reversal_v1
before update of stage, converted_project_id, converted_at
on public.organization_opportunities
for each row execute function public.prevent_opportunity_award_reversal_v1();

revoke all on function public.prevent_opportunity_award_reversal_v1()
from public, anon, authenticated;

comment on function public.prevent_opportunity_award_reversal_v1() is
  'Stage 3 guard that preserves an authoritative final Project mapping during ordinary Opportunity updates.';
