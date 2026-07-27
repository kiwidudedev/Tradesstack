alter table public.organization_memory_items
  add column if not exists source_semantic_pool_id uuid null
  references public.worksheet_memory_semantic_pools (id)
  on delete set null;

update public.organization_memory_items omi
set source_semantic_pool_id = candidate.semantic_pool_id
from (
  select
    id,
    organization_id,
    nullif(evidence_summary ->> 'semanticPoolId', '')::uuid as semantic_pool_id
  from public.organization_memory_items
  where source_semantic_pool_id is null
    and jsonb_typeof(evidence_summary) = 'object'
    and coalesce(evidence_summary ->> 'sourceType', '') = 'worksheet_memory_semantic_pool'
    and nullif(evidence_summary ->> 'semanticPoolId', '') is not null
) as candidate
where omi.id = candidate.id
  and exists (
    select 1
    from public.worksheet_memory_semantic_pools p
    where p.id = candidate.semantic_pool_id
      and p.organization_id = candidate.organization_id
  );

create index if not exists organization_memory_items_org_source_semantic_pool_idx
  on public.organization_memory_items (organization_id, source_semantic_pool_id, is_active, created_at asc)
  where source_semantic_pool_id is not null;

create index if not exists organization_memory_items_org_source_semantic_pool_revision_idx
  on public.organization_memory_items (organization_id, source_semantic_pool_id, source_revision_hash, updated_at desc)
  where source_semantic_pool_id is not null;
