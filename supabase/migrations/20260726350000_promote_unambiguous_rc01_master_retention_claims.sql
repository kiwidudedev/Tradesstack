begin;

-- Some development and imported datasets do not carry the historical
-- accounting-document link used by the primary classifier. Promote only an
-- unambiguous single submitted RC-01. Multiple-submitted-claim projects remain
-- legacy and require reviewed migration.
select set_config('app.retention_phase4_submission_write', 'true', true);

with candidates as (
  select claim.id
  from public.retention_claims claim
  where claim.status = 'submitted'
    and claim.master_role = 'legacy_separate_claim'
    and claim.claim_number ~ '-RC-01$'
    and not exists (
      select 1
      from public.retention_claims existing_master
      where existing_master.organization_id = claim.organization_id
        and existing_master.project_id = claim.project_id
        and existing_master.master_role = 'master_retention_claim'
    )
    and (
      select count(*)
      from public.retention_claims submitted_claim
      where submitted_claim.organization_id = claim.organization_id
        and submitted_claim.project_id = claim.project_id
        and submitted_claim.status = 'submitted'
    ) = 1
)
update public.retention_claims claim
set master_role = 'master_retention_claim'
from candidates
where claim.id = candidates.id;

select set_config('app.retention_phase4_submission_write', '', true);

commit;
