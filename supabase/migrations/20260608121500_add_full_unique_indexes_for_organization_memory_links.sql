drop index if exists public.organization_memory_links_item_source_event_uidx;
drop index if exists public.organization_memory_links_item_source_entity_role_uidx;

create unique index if not exists organization_memory_links_item_source_event_uidx
  on public.organization_memory_links (organization_memory_item_id, source_event_id);

create unique index if not exists organization_memory_links_item_source_entity_role_uidx
  on public.organization_memory_links (organization_memory_item_id, source_entity_type, source_entity_id, link_type);
