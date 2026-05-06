create index if not exists takeoff_measurements_page_active_created_idx
  on public.takeoff_measurements (page_id, created_at)
  where status <> 'deleted';
