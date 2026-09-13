-- READ ONLY. This report identifies legacy Drafts created by the old award
-- finalizer and surfaces evidence needed for a controlled retirement decision.
-- It intentionally performs no update, archive, or delete.
with candidates as (
  select
    manifest.organization_id,
    manifest.id as manifest_id,
    manifest.project_id,
    manifest.accepted_quote_id,
    manifest.working_quote_id,
    manifest.created_at as award_created_at,
    accepted.quote_number as accepted_quote_number,
    working.quote_number as working_quote_number,
    working.status as working_status,
    working.revision_kind,
    working.created_at as working_created_at,
    working.updated_at as working_updated_at,
    working.id = md5(manifest.id::text || ':working-quote')::uuid as deterministic_id_match,
    working.predecessor_quote_id = accepted.id as predecessor_match,
    working.status = 'Draft' and working.revision_kind = 'project_working' as lifecycle_shape_match,
    working.updated_at <= manifest.created_at + interval '5 seconds' as no_later_quote_update,
    not exists (
      select 1 from public.project_quotes successor
      where successor.organization_id = manifest.organization_id
        and successor.predecessor_quote_id = working.id
    ) as no_successor,
    not exists (
      (select line.section, line.description, line.quantity, line.unit, line.rate,
        line.total, line.is_optional, line.sort_order, line.pricing_source_kind
       from public.project_quote_line_items line
       where line.organization_id = manifest.organization_id and line.quote_id = accepted.id)
      except all
      (select line.section, line.description, line.quantity, line.unit, line.rate,
        line.total, line.is_optional, line.sort_order, line.pricing_source_kind
       from public.project_quote_line_items line
       where line.organization_id = manifest.organization_id and line.quote_id = working.id)
    ) and not exists (
      (select line.section, line.description, line.quantity, line.unit, line.rate,
        line.total, line.is_optional, line.sort_order, line.pricing_source_kind
       from public.project_quote_line_items line
       where line.organization_id = manifest.organization_id and line.quote_id = working.id)
      except all
      (select line.section, line.description, line.quantity, line.unit, line.rate,
        line.total, line.is_optional, line.sort_order, line.pricing_source_kind
       from public.project_quote_line_items line
       where line.organization_id = manifest.organization_id and line.quote_id = accepted.id)
    ) as line_values_match,
    not exists (
      select 1 from public.opportunity_pricing_worksheets workbook
      where workbook.organization_id = manifest.organization_id
        and workbook.quote_id = working.id
        and workbook.updated_at > manifest.created_at + interval '5 seconds'
    ) as no_later_workbook_update
  from public.opportunity_award_pricing_manifests manifest
  join public.project_quotes accepted
    on accepted.organization_id = manifest.organization_id and accepted.id = manifest.accepted_quote_id
  join public.project_quotes working
    on working.organization_id = manifest.organization_id and working.id = manifest.working_quote_id
  where manifest.working_quote_id is not null
)
select *,
  deterministic_id_match and predecessor_match and lifecycle_shape_match
    and no_later_quote_update and no_successor and line_values_match
    and no_later_workbook_update as untouched_system_draft_candidate
from candidates
order by award_created_at, organization_id, project_id;
