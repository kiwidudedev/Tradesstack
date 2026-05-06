create index if not exists cost_items_review_queue_idx
on public.cost_items (organization_id, updated_at desc)
where is_current = true
  and needs_review = true
  and status not in ('deleted', 'superseded');
