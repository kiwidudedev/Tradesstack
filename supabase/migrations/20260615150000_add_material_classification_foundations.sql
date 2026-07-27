begin;

alter table public.organization_materials
  add column if not exists work_type text null,
  add column if not exists cost_type text null,
  add column if not exists cost_code text null,
  add column if not exists classification_confidence numeric null,
  add column if not exists classification_source text null,
  add column if not exists needs_review boolean not null default false,
  add column if not exists original_classification jsonb null,
  add column if not exists final_classification jsonb null,
  add column if not exists confirmed_by_user_id uuid null references auth.users (id) on delete set null,
  add column if not exists confirmed_at timestamptz null;

alter table public.organization_materials
  drop constraint if exists organization_materials_classification_confidence_range_check,
  drop constraint if exists organization_materials_classification_source_check,
  drop constraint if exists organization_materials_original_classification_object_check,
  drop constraint if exists organization_materials_final_classification_object_check;

alter table public.organization_materials
  add constraint organization_materials_classification_confidence_range_check check (
    classification_confidence is null
    or (classification_confidence >= 0 and classification_confidence <= 1)
  ),
  add constraint organization_materials_classification_source_check check (
    classification_source is null
    or classification_source in ('rules', 'user_confirmed', 'ai', 'imported')
  ),
  add constraint organization_materials_original_classification_object_check check (
    original_classification is null
    or jsonb_typeof(original_classification) = 'object'
  ),
  add constraint organization_materials_final_classification_object_check check (
    final_classification is null
    or jsonb_typeof(final_classification) = 'object'
  );

create index if not exists organization_materials_org_needs_review_idx
  on public.organization_materials (organization_id, needs_review, updated_at desc)
  where needs_review = true;

create index if not exists organization_materials_org_classification_idx
  on public.organization_materials (organization_id, work_type, cost_type, cost_code);

alter table public.organization_material_import_rows
  add column if not exists classified_work_type text null,
  add column if not exists classified_cost_type text null,
  add column if not exists classified_cost_code text null,
  add column if not exists classified_confidence numeric null,
  add column if not exists classified_source text null,
  add column if not exists classified_needs_review boolean not null default false,
  add column if not exists classified_original_classification jsonb null,
  add column if not exists classified_final_classification jsonb null,
  add column if not exists classified_organization_cost_code_id uuid null references public.organization_cost_codes (id) on delete set null,
  add column if not exists classification_reason_summary text null;

alter table public.organization_material_import_rows
  drop constraint if exists organization_material_import_rows_classified_confidence_check,
  drop constraint if exists organization_material_import_rows_classified_source_check,
  drop constraint if exists organization_material_import_rows_classified_original_object_check,
  drop constraint if exists organization_material_import_rows_classified_final_object_check;

alter table public.organization_material_import_rows
  add constraint organization_material_import_rows_classified_confidence_check check (
    classified_confidence is null
    or (classified_confidence >= 0 and classified_confidence <= 1)
  ),
  add constraint organization_material_import_rows_classified_source_check check (
    classified_source is null
    or classified_source in ('rules', 'user_confirmed', 'ai', 'imported')
  ),
  add constraint organization_material_import_rows_classified_original_object_check check (
    classified_original_classification is null
    or jsonb_typeof(classified_original_classification) = 'object'
  ),
  add constraint organization_material_import_rows_classified_final_object_check check (
    classified_final_classification is null
    or jsonb_typeof(classified_final_classification) = 'object'
  );

create index if not exists organization_material_import_rows_org_review_idx
  on public.organization_material_import_rows (organization_id, status, classified_needs_review, updated_at desc);

commit;
