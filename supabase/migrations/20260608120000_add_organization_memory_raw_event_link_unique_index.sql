create unique index if not exists organization_memory_links_item_source_event_uidx
  on public.organization_memory_links (organization_memory_item_id, source_event_id)
  where source_event_id is not null;
