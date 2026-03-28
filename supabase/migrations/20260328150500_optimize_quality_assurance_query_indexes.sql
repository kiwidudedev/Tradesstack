create index if not exists project_quality_issues_org_project_created_idx
  on public.project_quality_issues (organization_id, project_id, created_at desc);

create index if not exists project_quality_issues_org_project_status_due_idx
  on public.project_quality_issues (organization_id, project_id, status, due_date);

create index if not exists project_quality_issue_photos_org_project_created_idx
  on public.project_quality_issue_photos (organization_id, project_id, created_at desc);

create index if not exists project_quality_issue_photos_org_project_issue_created_idx
  on public.project_quality_issue_photos (organization_id, project_id, issue_id, created_at desc);

create index if not exists project_quality_inspections_org_project_scheduled_idx
  on public.project_quality_inspections (organization_id, project_id, scheduled_at);

create index if not exists project_quality_inspection_items_org_project_inspection_created_idx
  on public.project_quality_inspection_items (organization_id, project_id, inspection_id, created_at);

create index if not exists project_quality_sign_offs_org_project_created_idx
  on public.project_quality_sign_offs (organization_id, project_id, created_at);

create index if not exists project_job_todos_org_project_source_created_idx
  on public.project_job_todos (organization_id, project_id, source_type, created_at desc);
