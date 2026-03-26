-- Backfill canonical trade_packs rows from previously generated trade-pack PDFs
-- stored in project_drawing_sets.

with candidates as (
  select
    ds.id,
    ds.organization_id,
    ds.project_id,
    ds.uploaded_by as created_by,
    ds.storage_path,
    ds.uploaded_at,
    (regexp_match(lower(ds.storage_path), '-([a-z0-9-]+)-trade-pack\\.pdf$'))[1] as slug_from_path,
    (regexp_match(ds.file_name, '-\\s*(.+?)\\s*TRADE PACK$', 'i'))[1] as label_from_name
  from public.project_drawing_sets ds
  where (
    ds.file_name ilike '%trade pack%'
    or ds.file_name ilike '%-trade-pack.pdf'
    or ds.storage_path ilike '%-trade-pack.pdf'
  )
    and not exists (
      select 1
      from public.trade_packs tp
      where tp.id = ds.id
    )
), normalized as (
  select
    id,
    organization_id,
    project_id,
    created_by,
    storage_path,
    uploaded_at,
    coalesce(
      nullif(slug_from_path, ''),
      nullif(regexp_replace(lower(coalesce(label_from_name, '')), '[^a-z0-9]+', '-', 'g'), '')
    ) as trade_id,
    coalesce(
      nullif(label_from_name, ''),
      nullif(initcap(replace(slug_from_path, '-', ' ')), ''),
      'Trade Pack'
    ) as trade_label
  from candidates
)
insert into public.trade_packs (
  id,
  organization_id,
  project_id,
  trade_id,
  trade_label,
  pdf_url,
  page_index_json,
  created_by,
  created_at
)
select
  n.id,
  n.organization_id,
  n.project_id,
  n.trade_id,
  n.trade_label,
  'supabase://project-drawing-sets/' || n.storage_path,
  '[]'::jsonb,
  n.created_by,
  n.uploaded_at
from normalized n
where n.trade_id is not null
  and btrim(n.trade_id) <> ''
on conflict (id) do nothing;
