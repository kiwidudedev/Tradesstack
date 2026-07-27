alter table public.worksheet_memory_semantic_pools
  add column if not exists domain_label text null,
  add column if not exists domain_summary text null,
  add column if not exists grouping_rationale text null,
  add column if not exists variant_summary text null,
  add column if not exists included_count integer not null default 0,
  add column if not exists excluded_count integer not null default 0,
  add column if not exists adjacent_count integer not null default 0,
  add column if not exists uncertain_count integer not null default 0;

alter table public.worksheet_memory_semantic_pools
  drop constraint if exists worksheet_memory_semantic_pools_counts_non_negative_check;

alter table public.worksheet_memory_semantic_pools
  add constraint worksheet_memory_semantic_pools_counts_non_negative_check check (
    support_count >= 0
    and contradiction_count >= 0
    and ignored_count >= 0
    and included_count >= 0
    and excluded_count >= 0
    and adjacent_count >= 0
    and uncertain_count >= 0
    and worksheet_count >= 0
    and workbook_count >= 0
    and project_count >= 0
  );

update public.worksheet_memory_semantic_pools
set
  domain_label = coalesce(domain_label, title),
  domain_summary = coalesce(domain_summary, summary),
  grouping_rationale = coalesce(grouping_rationale, 'Legacy semantic pool output migrated to a neutral evidence-domain cluster.'),
  variant_summary = coalesce(variant_summary, ''),
  included_count = coalesce(included_count, support_count, 0),
  excluded_count = coalesce(excluded_count, ignored_count, 0),
  adjacent_count = coalesce(adjacent_count, 0),
  uncertain_count = coalesce(uncertain_count, contradiction_count, 0);

alter table public.worksheet_memory_semantic_pool_events
  drop constraint if exists worksheet_memory_semantic_pool_events_evidence_role_check;

update public.worksheet_memory_semantic_pool_events
set evidence_role = case evidence_role
  when 'supporting' then 'included'
  when 'contradictory' then 'uncertain'
  when 'ignored' then 'excluded'
  else evidence_role
end;

alter table public.worksheet_memory_semantic_pool_events
  add constraint worksheet_memory_semantic_pool_events_evidence_role_check check (
    evidence_role in ('included', 'excluded', 'adjacent', 'uncertain')
  );
