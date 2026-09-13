-- TradesStack target preflight: read-only SELECT/catalog/count statements only.
-- Prepared offline from the operator exports dated 2026-09-13 18:22:13 NZST.
-- NOT executed against the target. Run only with an operator-provided read-only role.
-- No credentials, custom RPC calls, DO blocks, DDL, DML, locks or activation calls.
-- Counts describe current data, not completeness of data removed in historical migrations.
-- Migration state/schema may change after this export: inspect query prerequisites first.
-- Bucket/object SELECTs require storage catalog read privileges; do not weaken RLS to run them.
-- All output is aggregate or schema metadata. Review findings before any later mutation.

-- 01. Confirm target context and exported migration history. No credentials are selected.
SELECT current_database() AS database_name, current_user AS export_role, current_timestamp AS observed_at;
SELECT version, name, cardinality(statements) AS statement_count, md5(array_to_string(statements, E'\n')) AS statement_fingerprint FROM supabase_migrations.schema_migrations ORDER BY version;

-- 02. Version collisions (expected no rows). Physical COPY row order is not execution order.
SELECT version, count(*) FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1;

-- 03. Expected pending worker migrations and historical destructive migration status.
SELECT expected.version, history.name, history.version IS NOT NULL AS applied FROM (VALUES ('20260228173000'),('20260718090000'),('20260810190000'),('20260823170000'),('20260913100000'),('20260913110000'),('20260913120000'),('20260913130000'),('20260913140000'),('20260913150000'),('20260913160000')) AS expected(version) LEFT JOIN supabase_migrations.schema_migrations history USING(version) ORDER BY expected.version;

-- 04. Exact catalog contract: types, nullability, defaults and generated attributes.
SELECT n.nspname AS schema_name,c.relname AS table_name,a.attname AS column_name,
 pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull,a.attgenerated,
 pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_or_generation
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
ORDER BY c.relname,a.attnum;

-- 05. All 15 retired columns: exported target has none. Do not reapply the retirement migration.
SELECT expected.table_name,expected.column_name,a.attname IS NOT NULL AS still_exists FROM (VALUES ('public.cost_items','work_type'),('public.cost_items','cost_type'),('public.cost_items','cost_code'),('public.cost_items','classification_confidence'),('public.cost_items','classification_source'),('public.cost_items','needs_review'),('public.cost_items','original_classification'),('public.cost_items','final_classification'),('public.supplier_invoice_line_allocations','work_type'),('public.supplier_invoice_line_allocations','cost_type'),('public.supplier_invoice_line_allocations','internal_cost_code'),('public.supplier_invoice_line_allocations','classification_status'),('public.project_actual_cost_events','work_type'),('public.project_actual_cost_events','cost_type'),('public.project_actual_cost_events','internal_cost_code')) AS expected(table_name,column_name) LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=pg_catalog.to_regclass(expected.table_name) AND a.attname=expected.column_name AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2;

-- 06. Removed mapping/profile objects and canonical invites. NULL reltuples is unknown, never evidence of zero rows.
SELECT expected.object_name,c.oid IS NOT NULL AS exists,c.reltuples::bigint AS estimated_rows FROM (VALUES ('public.organization_cost_code_mapping_rules'),('public.profiles'),('public.organization_invites')) expected(object_name) LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(expected.object_name);

-- 07. Retired-source table row counts and residual legacy values (zero for absent columns does not prove historical recovery).
SELECT 'public.cost_items' AS table_name,count(*) AS rows,
 count(*) FILTER (WHERE to_jsonb(t)->>'work_type' IS NOT NULL) AS "work_type_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'cost_type' IS NOT NULL) AS "cost_type_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'cost_code' IS NOT NULL) AS "cost_code_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'classification_confidence' IS NOT NULL) AS "classification_confidence_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'classification_source' IS NOT NULL) AS "classification_source_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'needs_review' IS NOT NULL) AS "needs_review_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'original_classification' IS NOT NULL) AS "original_classification_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'final_classification' IS NOT NULL) AS "final_classification_non_null" FROM "public"."cost_items" t;

-- 07. Retired-source table row counts and residual legacy values (zero for absent columns does not prove historical recovery).
SELECT 'public.supplier_invoice_line_allocations' AS table_name,count(*) AS rows,
 count(*) FILTER (WHERE to_jsonb(t)->>'work_type' IS NOT NULL) AS "work_type_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'cost_type' IS NOT NULL) AS "cost_type_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'internal_cost_code' IS NOT NULL) AS "internal_cost_code_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'classification_status' IS NOT NULL) AS "classification_status_non_null" FROM "public"."supplier_invoice_line_allocations" t;

-- 07. Retired-source table row counts and residual legacy values (zero for absent columns does not prove historical recovery).
SELECT 'public.project_actual_cost_events' AS table_name,count(*) AS rows,
 count(*) FILTER (WHERE to_jsonb(t)->>'work_type' IS NOT NULL) AS "work_type_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'cost_type' IS NOT NULL) AS "cost_type_non_null",
 count(*) FILTER (WHERE to_jsonb(t)->>'internal_cost_code' IS NOT NULL) AS "internal_cost_code_non_null" FROM "public"."project_actual_cost_events" t;

-- 08. Canonical organization/invitation counts; schema-only exports cannot prove historical data equivalence.
SELECT 'organizations' AS table_name,count(*) AS rows FROM public.organizations UNION ALL SELECT 'organization_members',count(*) FROM public.organization_members UNION ALL SELECT 'organization_invites',count(*) FROM public.organization_invites;

-- 09. Deterministic generated supplier reference and retained source. Expected mismatches = 0.
SELECT count(*) AS invoices,count(*) FILTER (WHERE supplier_po_reference_normalized IS DISTINCT FROM nullif(lower(regexp_replace(trim(coalesce(supplier_po_reference,'')),'[[:space:]]+',' ','g')),'')) AS derivation_mismatches FROM public.supplier_invoices;

-- 10. Replacement classifier data coverage. Missing values require business review, not blind deletion/backfill.
SELECT count(*) AS rows,
 count(*) FILTER (WHERE is_current) AS current_rows,
 count(*) FILTER (WHERE is_current AND nullif(tradesstack_cost_code::text,'') IS NULL) AS current_without_named_code,
 count(*) FILTER (WHERE is_current AND (ai_construction_intelligence IS NULL OR ai_construction_intelligence='{}'::jsonb)) AS current_without_ai_context,
 count(*) FILTER (WHERE source_line_id IS NULL) AS without_source_line
FROM public.cost_items;

-- 11. Duplicate current source identifiers (expected no unexplained duplicates).
SELECT organization_id,source_line_table,source_line_id,count(*) FROM public.cost_items WHERE is_current AND source_line_id IS NOT NULL GROUP BY organization_id,source_line_table,source_line_id HAVING count(*)>1;

-- 12. Material supplier attachment/import prerequisites and orphaned suppliers.
SELECT count(*) AS batches,
 count(*) FILTER (WHERE b.supplier_id IS NULL) AS without_supplier,
 count(*) FILTER (WHERE b.supplier_id IS NOT NULL AND s.id IS NULL) AS missing_or_cross_org_supplier,
 count(*) FILTER (WHERE nullif(b.storage_path,'') IS NULL AND b.source_deleted_at IS NULL) AS no_source_path_or_deletion_record
FROM public.organization_material_import_batches b LEFT JOIN public.organization_suppliers s ON s.id=b.supplier_id AND s.organization_id=b.organization_id;

-- 13. Material row/batch organization lineage.
SELECT count(*) AS rows,count(*) FILTER (WHERE b.id IS NULL) AS missing_or_cross_org_batch FROM public.organization_material_import_rows r LEFT JOIN public.organization_material_import_batches b ON b.id=r.import_batch_id AND b.organization_id=r.organization_id;

-- 14. Quote-linked cost item backfill/lineage checks.
SELECT count(*) AS linked_rows,count(*) FILTER (WHERE q.id IS NULL) AS missing_quote_line FROM public.cost_items c LEFT JOIN public.project_quote_line_items q ON q.id=c.linked_quote_line_item_id WHERE c.linked_quote_line_item_id IS NOT NULL;

-- 15. New NOT NULL worker prerequisite fields on existing rows.
SELECT count(*) AS jobs,count(*) FILTER (WHERE organization_id IS NULL OR import_batch_id IS NULL OR run_id IS NULL OR state IS NULL) AS invalid_required_fields FROM public.organization_material_import_jobs;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.organization_material_import_jobs' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."organization_material_import_jobs" q GROUP BY 2 ORDER BY 2;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.worksheet_mutation_evidence_v2_outbox' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."worksheet_mutation_evidence_v2_outbox" q GROUP BY 2 ORDER BY 2;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.document_storage_cleanup_jobs' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."document_storage_cleanup_jobs" q GROUP BY 2 ORDER BY 2;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.organization_accounting_sync_jobs' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."organization_accounting_sync_jobs" q GROUP BY 2 ORDER BY 2;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.project_qa_evidence_cleanup_jobs' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."project_qa_evidence_cleanup_jobs" q GROUP BY 2 ORDER BY 2;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.retention_rolling_draft_jobs' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."retention_rolling_draft_jobs" q GROUP BY 2 ORDER BY 2;

-- 16. Queue/backlog counts by state; no workers are invoked.
SELECT 'public.takeoff_render_jobs' AS queue,coalesce(to_jsonb(q)->>'state',to_jsonb(q)->>'status','not-state-based') AS state,count(*) AS rows,count(*) FILTER (WHERE to_jsonb(q)->>'dead_lettered_at' IS NOT NULL) AS dead_letters,count(*) FILTER (WHERE to_jsonb(q)->>'completed_at' IS NOT NULL) AS completed FROM "public"."takeoff_render_jobs" q GROUP BY 2 ORDER BY 2;

-- 17. Material import processing lease/retry state.
SELECT count(*) FILTER (WHERE state='processing' AND lease_expires_at<current_timestamp) AS expired_processing_leases,count(*) FILTER (WHERE state IN ('queued','processing') AND attempt_count>=max_attempts) AS exhausted_jobs,count(*) FILTER (WHERE state='processing' AND lease_token IS NULL) AS missing_processing_tokens FROM public.organization_material_import_jobs;

-- 18. Catalog inventory of pending/new cleanup table; absent before additive migration is expected.
SELECT c.relname,c.reltuples::bigint AS estimated_rows,c.relrowsecurity,c.relforcerowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('material_source_cleanup_jobs','project_qa_evidence_cleanup_jobs','document_storage_cleanup_jobs');

-- 19. RLS policy inventory. Permissive policies combine with OR; broad member policies can bypass narrower policies.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_catalog.pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname;

-- 20. RLS enabled/forced flags and table grants.
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p') ORDER BY 1,2;

-- 21. New worker RPC ACLs: absent before migration; anon/authenticated must be false after migration.
SELECT expected.name,p.oid IS NOT NULL AS exists,
 pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
 CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
 CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
 CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') END AS service_execute,p.prosecdef,p.proconfig
FROM (VALUES ('claim_project_qa_cleanup_jobs_v1'),('finish_project_qa_cleanup_job_v1'),('claim_material_import_job_v2'),('finalize_material_import_job_v2'),('claim_material_source_cleanup_v1'),('finish_material_source_cleanup_v1')) expected(name)
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=expected.name ORDER BY 1;

-- 22. SECURITY DEFINER owners, ACLs and body fingerprints; never execute these functions as a preflight.
SELECT n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.proacl,p.proconfig,md5(p.prosrc) AS body_fingerprint FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prosecdef ORDER BY 1,2,3;

-- 23. Pending source-retention eligibility; object bytes are not read or deleted.
SELECT count(*) AS expired_terminal_sources FROM public.organization_material_import_batches b WHERE storage_path IS NOT NULL AND source_deleted_at IS NULL AND source_retention_until<=current_timestamp AND status IN ('ready_for_review','partially_approved','approved','failed','cancelled') AND NOT EXISTS (SELECT 1 FROM public.organization_material_import_jobs j WHERE j.import_batch_id=b.id AND j.state IN ('queued','processing'));

-- 24. Bucket privacy/limits metadata absent from supplied schema export. No storage objects or URLs are selected.
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id;

-- 25. Material source reference coverage, not storage deletion authorization.
SELECT count(*) AS referenced_sources,count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='material-library-imports' AND o.name=b.storage_path)) AS missing_objects FROM public.organization_material_import_batches b WHERE b.storage_path IS NOT NULL AND b.source_deleted_at IS NULL;

-- 26. QA evidence reference coverage.
SELECT count(*) AS evidence_rows,count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id=e.storage_bucket AND o.name=e.storage_path)) AS missing_objects FROM public.project_qa_response_evidence e WHERE e.storage_path IS NOT NULL;

-- 27. Document storage references: counts only, use metadata columns without fetching signed URLs.
SELECT count(*) AS document_versions,count(*) FILTER (WHERE storage_key IS NOT NULL) AS versions_with_storage_key,count(*) FILTER (WHERE storage_object_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.id=v.storage_object_id)) AS missing_objects FROM public.document_versions v;

-- 28. Extension inventory.
SELECT extname,extversion,n.nspname AS extension_schema FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace ORDER BY extname;

-- 29. These 45 legacy policies may exist BEFORE reconciliation; AFTER, expected present=false.
SELECT expected.*,p.policyname IS NOT NULL AS present FROM (VALUES ('organization_client_locations','Admins can delete organization client locations'),('organization_client_locations','Members can create organization client locations'),('organization_client_locations','Members can update organization client locations'),('organization_client_locations','Members can view organization client locations'),('organization_clients','Admins can delete organization clients'),('organization_clients','Members can create organization clients'),('organization_clients','Members can update organization clients'),('organization_opportunities','Admins can delete organization opportunities'),('organization_opportunities','Members can create organization opportunities'),('organization_opportunities','Members can update organization opportunities'),('organizations','Members can update organization'),('project_purchase_order_attachments','Admins can delete purchase order attachments'),('project_purchase_order_attachments','Members can create purchase order attachments'),('project_purchase_order_attachments','Members can update purchase order attachments'),('project_purchase_order_invoice_items','Admins can delete purchase order invoice items'),('project_purchase_order_invoice_items','Members can create purchase order invoice items'),('project_purchase_order_invoice_items','Members can update purchase order invoice items'),('project_purchase_order_line_items','Admins can delete purchase order line items'),('project_purchase_order_line_items','Members can create purchase order line items'),('project_purchase_order_line_items','Members can update purchase order line items'),('project_purchase_order_status_events','Admins can delete purchase order status events'),('project_purchase_order_status_events','Members can create purchase order status events'),('project_purchase_orders','Admins can delete purchase orders'),('project_purchase_orders','Members can create purchase orders'),('project_purchase_orders','Members can update purchase orders'),('project_quote_line_items','Admins can delete quote line items'),('project_quote_line_items','Members can create quote line items'),('project_quote_line_items','Members can update quote line items'),('project_quotes','Admins can delete project quotes'),('project_quotes','Members can create project quotes'),('project_quotes','Members can update project quotes'),('project_variation_attachments','Admins can delete variation attachments'),('project_variation_attachments','Members can create variation attachments'),('project_variation_attachments','Members can update variation attachments'),('project_variation_invoice_items','Admins can delete variation invoice items'),('project_variation_invoice_items','Members can create variation invoice items'),('project_variation_invoice_items','Members can update variation invoice items'),('project_variation_line_items','Admins can delete variation line items'),('project_variation_line_items','Members can create variation line items'),('project_variation_line_items','Members can update variation line items'),('project_variation_status_events','Admins can delete variation status events'),('project_variation_status_events','Members can create variation status events'),('project_variations','Admins can delete project variations'),('project_variations','Members can create project variations'),('project_variations','Members can update project variations')) expected(table_name,policy_name) LEFT JOIN pg_catalog.pg_policies p ON p.schemaname='public' AND p.tablename=expected.table_name AND p.policyname=expected.policy_name ORDER BY 1,2;

-- 30. Explicit mobile/location access after reconciliation: worker reads only, service writes.
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
 pg_catalog.has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
 pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,
 pg_catalog.has_table_privilege('service_role',c.oid,'INSERT') AS service_insert
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('worker_project_assignments','worker_purchase_order_assignments','organization_client_locations');
-- 31. Permissions must exist in actual target data; schema-only rehearsal uses local fixtures.
SELECT expected.permission_key,p.permission_key IS NOT NULL AS exists
FROM (VALUES ('leads.clients.write'),('settings.organization.update'),('supplier_invoices.capture'),('quotes.write')) expected(permission_key)
LEFT JOIN public.app_permissions p USING(permission_key);
SELECT role,permission_key,is_allowed FROM public.role_permissions
WHERE permission_key IN ('leads.clients.write','settings.organization.update','supplier_invoices.capture','quotes.write') ORDER BY 1,2;
-- 32. All explicit catalog constraints, including NOT VALID checks awaiting data review.
SELECT n.nspname,t.relname,c.conname,c.contype,c.convalidated,pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('change_detection_runs','spec_finishes_runs','takeoff_measurements','worker_project_assignments','worker_purchase_order_assignments','project_purchase_order_assignments','project_time_sheet_entries','organization_client_locations','organizations','organization_clients') ORDER BY 1,2,3;
-- 33. Historical rows violating current CHECK rules. Each count must be reviewed; never auto-delete.
SELECT 'change_detection_runs_baseline_revision_not_blank' AS check_name,count(*) AS violating_rows FROM public.change_detection_runs WHERE NOT (char_length(pg_catalog.btrim(baseline_revision)) > 0);
SELECT 'change_detection_runs_result_json_object' AS check_name,count(*) AS violating_rows FROM public.change_detection_runs WHERE NOT (jsonb_typeof(result_json) = CAST('object' AS text));
SELECT 'change_detection_runs_revised_file_name_not_blank' AS check_name,count(*) AS violating_rows FROM public.change_detection_runs WHERE NOT (char_length(pg_catalog.btrim(revised_file_name)) > 0);
SELECT 'change_detection_runs_revised_revision_not_blank' AS check_name,count(*) AS violating_rows FROM public.change_detection_runs WHERE NOT (char_length(pg_catalog.btrim(revised_revision)) > 0);
SELECT 'change_detection_runs_validation_json_object' AS check_name,count(*) AS violating_rows FROM public.change_detection_runs WHERE NOT (jsonb_typeof(validation_json) = CAST('object' AS text));
SELECT 'spec_finishes_runs_trade_id_not_blank' AS check_name,count(*) AS violating_rows FROM public.spec_finishes_runs WHERE NOT (char_length(pg_catalog.btrim(trade_id)) > 0);
SELECT 'spec_finishes_runs_trade_label_not_blank' AS check_name,count(*) AS violating_rows FROM public.spec_finishes_runs WHERE NOT (char_length(pg_catalog.btrim(trade_label)) > 0);
SELECT 'takeoff_measurements_calibration_required' AS check_name,count(*) AS violating_rows FROM public.takeoff_measurements WHERE NOT (measurement_kind = CAST('count' AS public.takeoff_measurement_kind) OR (measurement_kind = ANY(ARRAY[CAST('line' AS public.takeoff_measurement_kind), CAST('area' AS public.takeoff_measurement_kind)]) AND calibration_id IS NOT NULL));

-- 34. Existing unique target constraints should already prevent these duplicates.
SELECT count(*) AS duplicate_assignment_groups FROM (SELECT purchase_order_id,organization_member_id FROM public.project_purchase_order_assignments GROUP BY 1,2 HAVING count(*)>1) d;
SELECT count(*) AS duplicate_mobile_entry_groups FROM (SELECT organization_id,client_entry_id FROM public.project_time_sheet_entries WHERE client_entry_id IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d;
-- 35. Existing organization lineage is retained; mismatches require a separate data decision.
SELECT count(*) AS cross_org_client_locations FROM public.organization_client_locations l JOIN public.organization_clients c ON c.id=l.client_id WHERE c.organization_id<>l.organization_id;
SELECT count(*) AS cross_org_worker_projects FROM public.worker_project_assignments a JOIN public.organization_projects p ON p.id=a.project_id WHERE a.organization_id<>p.organization_id;
SELECT count(*) AS cross_org_worker_purchase_orders FROM public.worker_purchase_order_assignments a JOIN public.project_purchase_orders p ON p.id=a.purchase_order_id WHERE a.organization_id<>p.organization_id OR a.project_id<>p.project_id;
-- 36. Managed role topology was not exported. Read names/flags only, never password catalogs.
SELECT rolname,rolsuper,rolinherit,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres','supabase_admin');
SELECT parent.rolname AS granted_role,child.rolname AS member_role,m.admin_option FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid JOIN pg_catalog.pg_roles child ON child.oid=m.member ORDER BY 1,2;

-- 37. Expected selected forward function bodies; differences before migration are expected.
SELECT expected.*,md5(p.prosrc) AS actual_fingerprint,md5(p.prosrc)=expected.fingerprint AS matches FROM (VALUES
 ('public','is_admin_of_organization','target_organization_id uuid','d9095df714b433dee9cbb2be0c113b5a'),
 ('public','sync_project_job_todo_completion_fields','','ee03e4993a7e997baea6e74b9346d127'),
 ('public','has_permission','p_permission_key text','36bd95209a374c693be75db48cff961c'),
 ('public','log_organization_invite_audit','','1633870d74ab9a837e33cfdb038bf4de'),
 ('public','resolve_cost_item_document_context','p_document_kind text, p_document_id uuid','ba82c8ba52de243287a309cc1f719fd7'),
 ('public','delete_opportunity_pricing_workbook_sheet','p_organization_id uuid, p_opportunity_id uuid, p_workbook_id uuid, p_sheet_id uuid, p_user_id uuid, p_next_sheet_id uuid','c984dbc03f3210e58931af229f53e9cc'),
 ('private','decide_supplier_invoice_site_review_phase_ab_legacy','p_decision_id uuid, p_decision text, p_note text, p_accepted_variances jsonb, p_disputed_allocation_ids uuid[]','f250afe9eccaa1743d189bceb656e18c'),
 ('private','submit_supplier_invoice_for_site_review_phase_ab_legacy','p_supplier_invoice_id uuid, p_expected_finance_hash text','4973cdb447cea37d84b223850b845f02'),
 ('private','save_supplier_invoice_capture_phase_ab_legacy','p_invoice_id uuid, p_supplier_id uuid, p_invoice_number text, p_supplier_po_reference text, p_invoice_date date, p_due_date date, p_currency text, p_subtotal numeric, p_tax_total numeric, p_total numeric, p_notes text, p_source text, p_lines jsonb, p_create boolean','952034f351a29fc461c3a8a55b3b4888'),
 ('private','record_supplier_invoice_accounts_approval_phase_ab_legacy','p_supplier_invoice_id uuid, p_site_review_submission_id uuid, p_expected_finance_hash text, p_approval_note text','c6d56046757e06e57b21e715928a8cac'),
 ('public','get_accounting_sync_completion_evidence','p_organization_id uuid, p_job_id uuid','0f06b00858a00957828fcdd977524e26'),
 ('public','sync_organization_tax_policy_version','','05643f1f52dd5db1177fec54a4ed07db'),
 ('public','create_takeoff_commercial_item','p_input jsonb','583bc71088fd0ce54a030f8b8b53c450'),
 ('public','set_updated_at_timestamp','','9b1889f56258bf9d6554213c05019c76')
) expected(schema_name,function_name,arguments,fingerprint) LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=expected.schema_name LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=expected.function_name AND pg_catalog.pg_get_function_identity_arguments(p.oid)=expected.arguments ORDER BY 1,2,3;
