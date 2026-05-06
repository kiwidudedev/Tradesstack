update public.organization_projects p
set source_opportunity_id = o.id
from public.organization_opportunities o
where o.converted_project_id is not null
  and o.converted_project_id = p.id
  and o.organization_id = p.organization_id
  and p.source_opportunity_id is null;
