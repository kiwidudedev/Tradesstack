create index if not exists project_job_todos_dash_overdue_due_at_idx
  on public.project_job_todos (organization_id, project_id, due_at)
  where status <> 'Complete' and due_at is not null;

create index if not exists project_job_todos_dash_overdue_due_date_idx
  on public.project_job_todos (organization_id, project_id, due_date)
  where status <> 'Complete' and due_at is null;

create index if not exists project_quality_issues_dash_status_idx
  on public.project_quality_issues (organization_id, project_id, status);

create index if not exists project_quality_inspection_items_dash_status_idx
  on public.project_quality_inspection_items (organization_id, project_id, status);

create index if not exists project_variations_dash_status_idx
  on public.project_variations (organization_id, project_id, status);

create index if not exists project_claims_dash_draft_ready_idx
  on public.project_claims (organization_id, project_id, status, claim_date)
  where status = 'Draft' and claim_amount > 0;

create index if not exists project_time_sheet_entries_dash_active_workers_idx
  on public.project_time_sheet_entries (organization_id, project_id, clock_out_at)
  where clock_out_at is null;

create index if not exists project_quality_sign_offs_dash_status_idx
  on public.project_quality_sign_offs (organization_id, project_id, status);
