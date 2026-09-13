-- Recover authoritative indexes and current repository CHECK contracts without scanning

-- or rewriting existing target rows. NOT VALID checks enforce new/updated rows;

-- validation of pre-existing rows requires a separately reviewed read-only preflight.

begin;

CREATE INDEX IF NOT EXISTS change_detection_runs_project_created_idx ON public.change_detection_runs USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_members_org_display_name_idx ON public.organization_members USING btree (organization_id, display_name);

CREATE INDEX IF NOT EXISTS idx_po_assignments_member ON public.project_purchase_order_assignments USING btree (organization_member_id);

CREATE INDEX IF NOT EXISTS idx_po_assignments_org_project ON public.project_purchase_order_assignments USING btree (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_po_assignments_po ON public.project_purchase_order_assignments USING btree (purchase_order_id);

CREATE INDEX IF NOT EXISTS project_quality_issues_org_project_updated_desc_idx ON public.project_quality_issues USING btree (organization_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS project_quality_sign_offs_org_project_updated_desc_idx ON public.project_quality_sign_offs USING btree (organization_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS project_quotes_org_project_updated_desc_idx ON public.project_quotes USING btree (organization_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS project_time_sheet_events_org_project_created_desc_idx ON public.project_time_sheet_events USING btree (organization_id, project_id, created_at DESC);

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.project_purchase_order_assignments'::regclass and conname='project_purchase_order_assignments_unique_active') then
  ALTER TABLE public.project_purchase_order_assignments ADD CONSTRAINT project_purchase_order_assignments_unique_active UNIQUE (purchase_order_id, organization_member_id);
 end if;
end $guard$;

-- The two historical names have exactly the same status expression. Preserve validation.
do $guard$ begin
 if exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_status_check')
 and not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_status_valid') then
  alter table public.change_detection_runs rename constraint change_detection_runs_status_check to change_detection_runs_status_valid;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_baseline_revision_not_blank') then
  alter table public.change_detection_runs add CONSTRAINT change_detection_runs_baseline_revision_not_blank CHECK (char_length(pg_catalog.btrim(baseline_revision)) > 0) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_result_json_object') then
  alter table public.change_detection_runs add CONSTRAINT change_detection_runs_result_json_object CHECK (jsonb_typeof(result_json) = CAST('object' AS text)) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_revised_file_name_not_blank') then
  alter table public.change_detection_runs add CONSTRAINT change_detection_runs_revised_file_name_not_blank CHECK (char_length(pg_catalog.btrim(revised_file_name)) > 0) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_revised_revision_not_blank') then
  alter table public.change_detection_runs add CONSTRAINT change_detection_runs_revised_revision_not_blank CHECK (char_length(pg_catalog.btrim(revised_revision)) > 0) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.change_detection_runs'::regclass and conname='change_detection_runs_validation_json_object') then
  alter table public.change_detection_runs add CONSTRAINT change_detection_runs_validation_json_object CHECK (jsonb_typeof(validation_json) = CAST('object' AS text)) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.spec_finishes_runs'::regclass and conname='spec_finishes_runs_trade_id_not_blank') then
  alter table public.spec_finishes_runs add CONSTRAINT spec_finishes_runs_trade_id_not_blank CHECK (char_length(pg_catalog.btrim(trade_id)) > 0) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.spec_finishes_runs'::regclass and conname='spec_finishes_runs_trade_label_not_blank') then
  alter table public.spec_finishes_runs add CONSTRAINT spec_finishes_runs_trade_label_not_blank CHECK (char_length(pg_catalog.btrim(trade_label)) > 0) NOT VALID;
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.takeoff_measurements'::regclass and conname='takeoff_measurements_calibration_required') then
  alter table public.takeoff_measurements add CONSTRAINT takeoff_measurements_calibration_required CHECK (measurement_kind = CAST('count' AS public.takeoff_measurement_kind) OR (measurement_kind = ANY(ARRAY[CAST('line' AS public.takeoff_measurement_kind), CAST('area' AS public.takeoff_measurement_kind)]) AND calibration_id IS NOT NULL)) NOT VALID;
 end if;
end $guard$;

commit;
