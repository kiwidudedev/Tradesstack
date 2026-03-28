-- Remove legacy QA seed/demo rows inserted during early UI prototyping.
-- Safe: targets only known seed titles and linked auto-generated todos.

with seed_issues as (
  select id
  from public.project_quality_issues
  where lower(title) like '%crack in plaster%'
     or lower(title) like '%waterproofing seam gap%'
     or lower(title) like '%door hardware alignment%'
),
seed_inspections as (
  select id
  from public.project_quality_inspections
  where lower(title) in ('framing inspection', 'waterproofing check')
),
seed_inspection_items as (
  select ii.id
  from public.project_quality_inspection_items ii
  join seed_inspections si on si.id = ii.inspection_id
)
delete from public.project_job_todos t
where (t.source_type = 'qa_issue' and t.source_id in (select id from seed_issues))
   or (t.source_type = 'inspection_fail' and t.source_id in (select id from seed_inspection_items))
   or (lower(t.title) like 'framing inspection - %')
   or (lower(t.title) like 'waterproofing check - %')
   or (lower(t.title) like '%crack in plaster%')
   or (lower(t.title) like '%waterproofing seam gap%')
   or (lower(t.title) like '%door hardware alignment%');

delete from public.project_quality_sign_offs
where lower(title) in ('internal qa sign-off', 'client sign-off', 'final completion')
  and status = 'Pending'
  and signed_at is null;

delete from public.project_quality_issues
where id in (
  select id
  from public.project_quality_issues
  where lower(title) like '%crack in plaster%'
     or lower(title) like '%waterproofing seam gap%'
     or lower(title) like '%door hardware alignment%'
);

delete from public.project_quality_inspections
where lower(title) in ('framing inspection', 'waterproofing check');
