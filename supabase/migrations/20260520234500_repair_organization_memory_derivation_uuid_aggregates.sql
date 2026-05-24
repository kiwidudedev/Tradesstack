create or replace function public.run_organization_memory_derivation(
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
  resolved_limit integer := 500;
  module_cost_item_count integer := 0;
  module_cost_item_superseded integer := 0;
  module_cost_code_count integer := 0;
  module_cost_code_superseded integer := 0;
  module_worksheet_count integer := 0;
  module_worksheet_superseded integer := 0;
  module_supplier_invoice_count integer := 0;
  module_supplier_invoice_superseded integer := 0;
  module_takeoff_count integer := 0;
  module_takeoff_superseded integer := 0;
  candidate record;
  memory_item_id uuid;
  source_event_id uuid;
  pattern_note text;
begin
  if p_input is not null and jsonb_typeof(p_input) <> 'object' then
    raise exception 'run_organization_memory_derivation requires a JSON object payload';
  end if;

  perform public._organization_memory_assert_platform_admin('admin');

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  if resolved_organization_id is not null then
    perform public._organization_memory_assert_organization_exists(resolved_organization_id);
  end if;

  resolved_limit := greatest(coalesce(nullif(p_input->>'patternLimit', '')::integer, 500), 1);

  for candidate in
    with base as (
      select
        e.organization_id,
        coalesce(nullif(btrim(coalesce(e.after_data->>'workType', e.before_data->>'workType', '')), ''), 'Unspecified') as work_type,
        nullif(btrim(coalesce(e.before_data->>'costType', '')), '') as from_cost_type,
        nullif(btrim(coalesce(e.after_data->>'costType', '')), '') as to_cost_type,
        nullif(btrim(coalesce(e.before_data->>'costCode', '')), '') as from_cost_code,
        nullif(btrim(coalesce(e.after_data->>'costCode', '')), '') as to_cost_code,
        e.id as event_id
      from public.intelligence_events e
      where e.module = 'cost_items'
        and e.event_type = 'cost_item_classification_corrected'
        and (resolved_organization_id is null or e.organization_id = resolved_organization_id)
    ),
    filtered as (
      select
        b.*,
        concat_ws(
          '|',
          'workType=' || lower(b.work_type),
          'fromCostType=' || lower(coalesce(b.from_cost_type, 'unknown')),
          'fromCostCode=' || lower(coalesce(b.from_cost_code, 'unknown'))
        ) as pattern_scope_key,
        concat_ws(
          '|',
          'toCostType=' || lower(coalesce(b.to_cost_type, 'unknown')),
          'toCostCode=' || lower(coalesce(b.to_cost_code, 'unknown'))
        ) as target_signature
      from base b
      where (
        coalesce(b.from_cost_type, '') <> coalesce(b.to_cost_type, '')
        or coalesce(b.from_cost_code, '') <> coalesce(b.to_cost_code, '')
      )
        and b.to_cost_type is not null
    ),
    aggregated as (
      select
        f.organization_id,
        f.pattern_scope_key,
        f.target_signature,
        min(f.work_type) as work_type,
        min(f.from_cost_type) as from_cost_type,
        min(f.to_cost_type) as to_cost_type,
        min(f.from_cost_code) as from_cost_code,
        min(f.to_cost_code) as to_cost_code,
        count(*)::integer as evidence_count,
        array_agg(f.event_id order by f.event_id) as source_event_ids
      from filtered f
      group by f.organization_id, f.pattern_scope_key, f.target_signature
    ),
    ranked as (
      select
        a.*,
        sum(a.evidence_count) over (partition by a.organization_id, a.pattern_scope_key) as total_evidence_count,
        count(*) over (partition by a.organization_id, a.pattern_scope_key) as distinct_target_count,
        row_number() over (
          partition by a.organization_id, a.pattern_scope_key
          order by a.evidence_count desc, a.target_signature asc
        ) as pattern_rank
      from aggregated a
    )
    select
      r.*,
      (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) as dominance_ratio
    from ranked r
    where r.pattern_rank = 1
      and r.evidence_count >= 2
      and (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) >= 0.60
    order by r.evidence_count desc, r.pattern_scope_key asc
    limit resolved_limit
  loop
    pattern_note := 'Derived from repeated cost item classification corrections.';

    memory_item_id := public._organization_memory_upsert_derived_item(
      candidate.organization_id,
      'classification_preference',
      'cost_item_classification_correction',
      candidate.pattern_scope_key || '|' || candidate.target_signature,
      candidate.work_type || ': prefer ' || candidate.to_cost_type || ' after repeated correction',
      'Repeated corrections indicate this organization prefers ' || candidate.to_cost_type
        || ' for ' || candidate.work_type
        || case when candidate.from_cost_type is not null then ' instead of ' || candidate.from_cost_type else '' end
        || '.',
      jsonb_build_object(
        'patternScopeKey', candidate.pattern_scope_key,
        'workType', candidate.work_type,
        'fromCostType', candidate.from_cost_type,
        'toCostType', candidate.to_cost_type,
        'fromCostCode', candidate.from_cost_code,
        'toCostCode', candidate.to_cost_code
      ),
      jsonb_build_object(
        'sourceType', 'intelligence_events',
        'sourceEventType', 'cost_item_classification_corrected',
        'evidenceCount', candidate.evidence_count,
        'totalEvidenceCount', candidate.total_evidence_count,
        'distinctTargetCount', candidate.distinct_target_count,
        'dominanceRatio', round(candidate.dominance_ratio, 4)
      ),
      public._organization_memory_confidence_from_signal(candidate.evidence_count, candidate.dominance_ratio),
      'financial_sensitive',
      'organization'
    );

    foreach source_event_id in array candidate.source_event_ids
    loop
      perform public.link_organization_memory_evidence(jsonb_build_object(
        'organizationId', candidate.organization_id,
        'organizationMemoryItemId', memory_item_id,
        'sourceEventId', source_event_id,
        'linkType', 'confirmation',
        'note', pattern_note
      ));
    end loop;

    module_cost_item_superseded := module_cost_item_superseded + public._organization_memory_mark_superseded_conflicts(
      candidate.organization_id,
      'classification_preference',
      'cost_item_classification_correction',
      candidate.pattern_scope_key,
      memory_item_id,
      'Superseded by a stronger repeated cost item correction pattern.'
    );
    module_cost_item_count := module_cost_item_count + 1;
  end loop;

  for candidate in
    with base as (
      select
        e.organization_id,
        nullif(btrim(coalesce(e.after_data->>'ruleType', '')), '') as rule_type,
        nullif(btrim(coalesce(e.after_data->>'intelligenceCostCode', '')), '') as intelligence_cost_code,
        nullif(btrim(coalesce(e.after_data->>'workType', '')), '') as work_type,
        nullif(btrim(coalesce(e.after_data->>'costType', '')), '') as cost_type,
        nullif(btrim(coalesce(e.after_data->>'targetCostCodeId', '')), '') as target_cost_code_id,
        nullif(btrim(coalesce(e.after_data->>'targetCostCodeLabel', '')), '') as target_cost_code_label,
        e.event_type,
        e.id as event_id
      from public.intelligence_events e
      where e.module = 'cost_code_mappings'
        and e.event_type in ('cost_code_mapping_overridden', 'cost_code_mapping_confirmed')
        and (resolved_organization_id is null or e.organization_id = resolved_organization_id)
    ),
    filtered as (
      select
        b.*,
        concat_ws(
          '|',
          'ruleType=' || lower(coalesce(b.rule_type, 'unknown')),
          'intelligenceCostCode=' || lower(coalesce(b.intelligence_cost_code, 'unknown')),
          'workType=' || lower(coalesce(b.work_type, 'unknown')),
          'costType=' || lower(coalesce(b.cost_type, 'unknown'))
        ) as pattern_scope_key,
        'targetCostCodeId=' || lower(coalesce(b.target_cost_code_id, 'unknown')) as target_signature
      from base b
      where b.target_cost_code_id is not null
    ),
    aggregated as (
      select
        f.organization_id,
        f.pattern_scope_key,
        f.target_signature,
        min(f.rule_type) as rule_type,
        min(f.intelligence_cost_code) as intelligence_cost_code,
        min(f.work_type) as work_type,
        min(f.cost_type) as cost_type,
        (array_agg(f.target_cost_code_id order by f.target_cost_code_id))[1] as target_cost_code_id,
        min(f.target_cost_code_label) as target_cost_code_label,
        count(*)::integer as evidence_count,
        count(*) filter (where f.event_type = 'cost_code_mapping_overridden')::integer as override_count,
        count(*) filter (where f.event_type = 'cost_code_mapping_confirmed')::integer as confirmation_count,
        array_agg(f.event_id order by f.event_id) as source_event_ids
      from filtered f
      group by f.organization_id, f.pattern_scope_key, f.target_signature
    ),
    ranked as (
      select
        a.*,
        sum(a.evidence_count) over (partition by a.organization_id, a.pattern_scope_key) as total_evidence_count,
        count(*) over (partition by a.organization_id, a.pattern_scope_key) as distinct_target_count,
        row_number() over (
          partition by a.organization_id, a.pattern_scope_key
          order by a.evidence_count desc, a.target_signature asc
        ) as pattern_rank
      from aggregated a
    )
    select
      r.*,
      (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) as dominance_ratio
    from ranked r
    where r.pattern_rank = 1
      and r.evidence_count >= 2
      and (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) >= 0.60
    order by r.evidence_count desc, r.pattern_scope_key asc
    limit resolved_limit
  loop
    pattern_note := 'Derived from repeated cost code mapping confirmations and overrides.';

    memory_item_id := public._organization_memory_upsert_derived_item(
      candidate.organization_id,
      'cost_code_mapping_preference',
      'organization_cost_code_mapping',
      candidate.pattern_scope_key || '|' || candidate.target_signature,
      coalesce(candidate.work_type, candidate.intelligence_cost_code, 'Cost code mapping') || ': prefer mapped cost code',
      'Repeated confirmed or overridden mappings indicate this organization prefers cost code '
        || coalesce(candidate.target_cost_code_label, candidate.target_cost_code_id)
        || ' for this mapping pattern.',
      jsonb_build_object(
        'patternScopeKey', candidate.pattern_scope_key,
        'ruleType', candidate.rule_type,
        'intelligenceCostCode', candidate.intelligence_cost_code,
        'workType', candidate.work_type,
        'costType', candidate.cost_type,
        'targetCostCodeId', candidate.target_cost_code_id,
        'targetCostCodeLabel', candidate.target_cost_code_label
      ),
      jsonb_build_object(
        'sourceType', 'intelligence_events',
        'sourceEventTypes', jsonb_build_array('cost_code_mapping_overridden', 'cost_code_mapping_confirmed'),
        'evidenceCount', candidate.evidence_count,
        'overrideCount', candidate.override_count,
        'confirmationCount', candidate.confirmation_count,
        'totalEvidenceCount', candidate.total_evidence_count,
        'distinctTargetCount', candidate.distinct_target_count,
        'dominanceRatio', round(candidate.dominance_ratio, 4)
      ),
      public._organization_memory_confidence_from_signal(candidate.evidence_count, candidate.dominance_ratio),
      'financial_sensitive',
      'organization'
    );

    foreach source_event_id in array candidate.source_event_ids
    loop
      perform public.link_organization_memory_evidence(jsonb_build_object(
        'organizationId', candidate.organization_id,
        'organizationMemoryItemId', memory_item_id,
        'sourceEventId', source_event_id,
        'linkType', 'confirmation',
        'note', pattern_note
      ));
    end loop;

    module_cost_code_superseded := module_cost_code_superseded + public._organization_memory_mark_superseded_conflicts(
      candidate.organization_id,
      'cost_code_mapping_preference',
      'organization_cost_code_mapping',
      candidate.pattern_scope_key,
      memory_item_id,
      'Superseded by a stronger repeated cost code mapping pattern.'
    );
    module_cost_code_count := module_cost_code_count + 1;
  end loop;

  for candidate in
    with base as (
      select
        e.organization_id,
        nullif(btrim(coalesce(e.metadata->>'worksheetName', '')), '') as worksheet_name,
        nullif(btrim(coalesce(e.metadata->>'tradePackage', '')), '') as trade_package,
        coalesce(nullif(e.metadata->'structureSummary'->>'rowCount', '')::integer, 0) as row_count,
        coalesce(nullif(e.metadata->'structureSummary'->>'columnCount', '')::integer, 0) as column_count,
        coalesce(nullif(e.metadata->'structureSummary'->>'formulaCount', '')::integer, 0) as formula_count,
        coalesce(nullif(e.metadata->'structureSummary'->>'populatedCellCount', '')::integer, 0) as populated_cell_count,
        e.entity_id as worksheet_entity_id,
        e.id as event_id
      from public.intelligence_events e
      where e.module = 'pricing_worksheets'
        and e.event_type = 'worksheet_saved'
        and (resolved_organization_id is null or e.organization_id = resolved_organization_id)
    ),
    filtered as (
      select
        b.*,
        concat_ws(
          '|',
          'worksheetName=' || lower(coalesce(b.worksheet_name, 'unknown')),
          'tradePackage=' || lower(coalesce(b.trade_package, 'none'))
        ) as pattern_scope_key,
        concat_ws(
          '|',
          'rowCount=' || b.row_count::text,
          'columnCount=' || b.column_count::text,
          'formulaCount=' || b.formula_count::text,
          'populatedCellCount=' || b.populated_cell_count::text
        ) as target_signature
      from base b
      where b.worksheet_name is not null
        and b.row_count > 0
        and b.column_count > 0
    ),
    aggregated as (
      select
        f.organization_id,
        f.pattern_scope_key,
        f.target_signature,
        min(f.worksheet_name) as worksheet_name,
        min(f.trade_package) as trade_package,
        min(f.row_count) as row_count,
        min(f.column_count) as column_count,
        min(f.formula_count) as formula_count,
        min(f.populated_cell_count) as populated_cell_count,
        count(*)::integer as save_count,
        count(distinct f.worksheet_entity_id)::integer as distinct_worksheet_count,
        array_agg(f.event_id order by f.event_id) as source_event_ids
      from filtered f
      group by f.organization_id, f.pattern_scope_key, f.target_signature
    ),
    ranked as (
      select
        a.*,
        sum(a.save_count) over (partition by a.organization_id, a.pattern_scope_key) as total_save_count,
        count(*) over (partition by a.organization_id, a.pattern_scope_key) as distinct_structure_count,
        row_number() over (
          partition by a.organization_id, a.pattern_scope_key
          order by a.distinct_worksheet_count desc, a.save_count desc, a.target_signature asc
        ) as pattern_rank
      from aggregated a
    )
    select
      r.*,
      (r.save_count::numeric / nullif(r.total_save_count, 0)) as dominance_ratio
    from ranked r
    where r.pattern_rank = 1
      and r.distinct_worksheet_count >= 2
      and (r.save_count::numeric / nullif(r.total_save_count, 0)) >= 0.60
    order by r.distinct_worksheet_count desc, r.save_count desc, r.pattern_scope_key asc
    limit resolved_limit
  loop
    pattern_note := 'Derived from repeated worksheet saves with the same compact structure signature.';

    memory_item_id := public._organization_memory_upsert_derived_item(
      candidate.organization_id,
      'worksheet_structure',
      'pricing_worksheet_layout',
      candidate.pattern_scope_key || '|' || candidate.target_signature,
      candidate.worksheet_name || ': preferred worksheet structure',
      'Repeated worksheet saves indicate this organization reuses a common structure for '
        || candidate.worksheet_name
        || case when candidate.trade_package is not null then ' (' || candidate.trade_package || ')' else '' end
        || '.',
      jsonb_build_object(
        'patternScopeKey', candidate.pattern_scope_key,
        'worksheetName', candidate.worksheet_name,
        'tradePackage', candidate.trade_package,
        'rowCount', candidate.row_count,
        'columnCount', candidate.column_count,
        'formulaCount', candidate.formula_count,
        'populatedCellCount', candidate.populated_cell_count
      ),
      jsonb_build_object(
        'sourceType', 'intelligence_events',
        'sourceEventType', 'worksheet_saved',
        'saveCount', candidate.save_count,
        'distinctWorksheetCount', candidate.distinct_worksheet_count,
        'totalSaveCount', candidate.total_save_count,
        'distinctStructureCount', candidate.distinct_structure_count,
        'dominanceRatio', round(candidate.dominance_ratio, 4)
      ),
      public._organization_memory_confidence_from_signal(candidate.distinct_worksheet_count, candidate.dominance_ratio),
      'financial_sensitive',
      'organization'
    );

    foreach source_event_id in array candidate.source_event_ids
    loop
      perform public.link_organization_memory_evidence(jsonb_build_object(
        'organizationId', candidate.organization_id,
        'organizationMemoryItemId', memory_item_id,
        'sourceEventId', source_event_id,
        'linkType', 'supporting',
        'note', pattern_note
      ));
    end loop;

    module_worksheet_superseded := module_worksheet_superseded + public._organization_memory_mark_superseded_conflicts(
      candidate.organization_id,
      'worksheet_structure',
      'pricing_worksheet_layout',
      candidate.pattern_scope_key,
      memory_item_id,
      'Superseded by a stronger repeated worksheet structure pattern.'
    );
    module_worksheet_count := module_worksheet_count + 1;
  end loop;

  for candidate in
    with base as (
      select
        e.organization_id,
        nullif(coalesce(e.after_data->>'supplierInvoiceId', e.before_data->>'supplierInvoiceId', e.metadata->>'supplierInvoiceId', ''), '')::uuid as supplier_invoice_id,
        nullif(coalesce(e.after_data->>'purchaseOrderId', e.before_data->>'purchaseOrderId', ''), '')::uuid as purchase_order_id,
        case
          when e.event_type = 'supplier_invoice_match_confirmed' then 'confirmed'
          when e.event_type = 'supplier_invoice_match_rejected' then 'rejected'
          else null
        end as disposition,
        coalesce(
          nullif(e.after_data->>'confidenceScore', '')::numeric,
          nullif(e.before_data->>'confidenceScore', '')::numeric
        ) as confidence_score,
        e.id as event_id
      from public.intelligence_events e
      where e.module = 'supplier_invoices'
        and e.event_type in ('supplier_invoice_match_confirmed', 'supplier_invoice_match_rejected')
        and (resolved_organization_id is null or e.organization_id = resolved_organization_id)
    ),
    joined as (
      select
        b.organization_id,
        si.supplier_id,
        b.supplier_invoice_id,
        b.purchase_order_id,
        b.disposition,
        b.confidence_score,
        b.event_id
      from base b
      join public.supplier_invoices si
        on si.id = b.supplier_invoice_id
       and si.organization_id = b.organization_id
      where b.purchase_order_id is not null
        and b.disposition is not null
    ),
    filtered as (
      select
        j.*,
        concat_ws(
          '|',
          'supplierId=' || j.supplier_id::text,
          'purchaseOrderId=' || j.purchase_order_id::text
        ) as pattern_scope_key,
        'disposition=' || j.disposition as target_signature
      from joined j
    ),
    aggregated as (
      select
        f.organization_id,
        f.pattern_scope_key,
        f.target_signature,
        (array_agg(f.supplier_id order by f.supplier_id))[1] as supplier_id,
        (array_agg(f.purchase_order_id order by f.purchase_order_id))[1] as purchase_order_id,
        min(f.disposition) as disposition,
        count(*)::integer as evidence_count,
        count(distinct f.supplier_invoice_id)::integer as distinct_invoice_count,
        avg(f.confidence_score) as avg_confidence_score,
        array_agg(f.event_id order by f.event_id) as source_event_ids
      from filtered f
      group by f.organization_id, f.pattern_scope_key, f.target_signature
    ),
    ranked as (
      select
        a.*,
        sum(a.evidence_count) over (partition by a.organization_id, a.pattern_scope_key) as total_evidence_count,
        count(*) over (partition by a.organization_id, a.pattern_scope_key) as distinct_disposition_count,
        row_number() over (
          partition by a.organization_id, a.pattern_scope_key
          order by a.distinct_invoice_count desc, a.evidence_count desc, a.target_signature asc
        ) as pattern_rank
      from aggregated a
    )
    select
      r.*,
      (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) as dominance_ratio
    from ranked r
    where r.pattern_rank = 1
      and r.distinct_invoice_count >= 2
      and (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) >= 0.60
    order by r.distinct_invoice_count desc, r.evidence_count desc, r.pattern_scope_key asc
    limit resolved_limit
  loop
    pattern_note := 'Derived from repeated supplier invoice match approvals or rejections.';

    memory_item_id := public._organization_memory_upsert_derived_item(
      candidate.organization_id,
      'supplier_matching_pattern',
      'supplier_invoice_purchase_order_match_disposition',
      candidate.pattern_scope_key || '|' || candidate.target_signature,
      'Supplier invoice match: prefer ' || candidate.disposition,
      'Repeated supplier invoice matching outcomes indicate this organization usually '
        || candidate.disposition
        || 's the supplier-to-purchase-order pairing captured in this pattern.',
      jsonb_build_object(
        'patternScopeKey', candidate.pattern_scope_key,
        'supplierId', candidate.supplier_id,
        'purchaseOrderId', candidate.purchase_order_id,
        'preferredDisposition', candidate.disposition
      ),
      jsonb_build_object(
        'sourceType', 'intelligence_events',
        'sourceEventTypes', jsonb_build_array('supplier_invoice_match_confirmed', 'supplier_invoice_match_rejected'),
        'evidenceCount', candidate.evidence_count,
        'distinctInvoiceCount', candidate.distinct_invoice_count,
        'totalEvidenceCount', candidate.total_evidence_count,
        'distinctDispositionCount', candidate.distinct_disposition_count,
        'dominanceRatio', round(candidate.dominance_ratio, 4),
        'averageConfidenceScore', round(coalesce(candidate.avg_confidence_score, 0), 4)
      ),
      public._organization_memory_confidence_from_signal(candidate.distinct_invoice_count, candidate.dominance_ratio),
      'financial_sensitive',
      'organization'
    );

    foreach source_event_id in array candidate.source_event_ids
    loop
      perform public.link_organization_memory_evidence(jsonb_build_object(
        'organizationId', candidate.organization_id,
        'organizationMemoryItemId', memory_item_id,
        'sourceEventId', source_event_id,
        'linkType', 'confirmation',
        'note', pattern_note
      ));
    end loop;

    module_supplier_invoice_superseded := module_supplier_invoice_superseded + public._organization_memory_mark_superseded_conflicts(
      candidate.organization_id,
      'supplier_matching_pattern',
      'supplier_invoice_purchase_order_match_disposition',
      candidate.pattern_scope_key,
      memory_item_id,
      'Superseded by a stronger repeated supplier invoice match disposition pattern.'
    );
    module_supplier_invoice_count := module_supplier_invoice_count + 1;
  end loop;

  for candidate in
    with base as (
      select
        e.organization_id,
        e.project_id,
        nullif(coalesce(e.after_data->>'pageId', e.before_data->>'pageId', ''), '')::uuid as page_id,
        coalesce(nullif(e.after_data->>'scaleRatio', '')::numeric, nullif(e.before_data->>'scaleRatio', '')::numeric) as scale_ratio,
        nullif(btrim(coalesce(e.after_data->>'displayUnit', e.before_data->>'displayUnit', '')), '') as display_unit,
        nullif(btrim(coalesce(e.after_data->>'baseUnit', e.before_data->>'baseUnit', '')), '') as base_unit,
        nullif(btrim(coalesce(e.after_data->>'unitSystem', e.before_data->>'unitSystem', '')), '') as unit_system,
        e.id as event_id
      from public.intelligence_events e
      where e.module = 'takeoff'
        and e.event_type in ('takeoff_calibration_created', 'takeoff_calibration_corrected')
        and (resolved_organization_id is null or e.organization_id = resolved_organization_id)
    ),
    joined as (
      select
        b.organization_id,
        b.project_id,
        b.page_id,
        tp.drawing_set_id,
        b.scale_ratio,
        b.display_unit,
        b.base_unit,
        b.unit_system,
        b.event_id
      from base b
      left join public.takeoff_pages tp
        on tp.id = b.page_id
       and tp.organization_id = b.organization_id
      where b.page_id is not null
        and b.scale_ratio is not null
        and b.display_unit is not null
    ),
    filtered as (
      select
        j.*,
        concat_ws(
          '|',
          'projectId=' || coalesce(j.project_id::text, 'none'),
          'pageId=' || j.page_id::text
        ) as pattern_scope_key,
        concat_ws(
          '|',
          'scaleRatio=' || j.scale_ratio::text,
          'displayUnit=' || lower(j.display_unit),
          'baseUnit=' || lower(coalesce(j.base_unit, 'unknown')),
          'unitSystem=' || lower(coalesce(j.unit_system, 'unknown'))
        ) as target_signature
      from joined j
    ),
    aggregated as (
      select
        f.organization_id,
        f.pattern_scope_key,
        f.target_signature,
        (array_agg(f.project_id order by f.project_id))[1] as project_id,
        (array_agg(f.page_id order by f.page_id))[1] as page_id,
        (array_agg(f.drawing_set_id order by f.drawing_set_id))[1] as drawing_set_id,
        min(f.scale_ratio) as scale_ratio,
        min(f.display_unit) as display_unit,
        min(f.base_unit) as base_unit,
        min(f.unit_system) as unit_system,
        count(*)::integer as evidence_count,
        array_agg(f.event_id order by f.event_id) as source_event_ids
      from filtered f
      group by f.organization_id, f.pattern_scope_key, f.target_signature
    ),
    ranked as (
      select
        a.*,
        sum(a.evidence_count) over (partition by a.organization_id, a.pattern_scope_key) as total_evidence_count,
        count(*) over (partition by a.organization_id, a.pattern_scope_key) as distinct_convention_count,
        row_number() over (
          partition by a.organization_id, a.pattern_scope_key
          order by a.evidence_count desc, a.target_signature asc
        ) as pattern_rank
      from aggregated a
    )
    select
      r.*,
      (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) as dominance_ratio
    from ranked r
    where r.pattern_rank = 1
      and r.evidence_count >= 2
      and (r.evidence_count::numeric / nullif(r.total_evidence_count, 0)) >= 0.60
    order by r.evidence_count desc, r.pattern_scope_key asc
    limit resolved_limit
  loop
    pattern_note := 'Derived from repeated takeoff calibration events for the same page.';

    memory_item_id := public._organization_memory_upsert_derived_item(
      candidate.organization_id,
      'takeoff_convention',
      'takeoff_page_calibration_convention',
      candidate.pattern_scope_key || '|' || candidate.target_signature,
      'Takeoff calibration convention for page ' || candidate.page_id::text,
      'Repeated takeoff calibration events indicate this project/page uses a stable calibration convention.',
      jsonb_build_object(
        'patternScopeKey', candidate.pattern_scope_key,
        'projectId', candidate.project_id,
        'pageId', candidate.page_id,
        'drawingSetId', candidate.drawing_set_id,
        'scaleRatio', candidate.scale_ratio,
        'displayUnit', candidate.display_unit,
        'baseUnit', candidate.base_unit,
        'unitSystem', candidate.unit_system
      ),
      jsonb_build_object(
        'sourceType', 'intelligence_events',
        'sourceEventTypes', jsonb_build_array('takeoff_calibration_created', 'takeoff_calibration_corrected'),
        'evidenceCount', candidate.evidence_count,
        'totalEvidenceCount', candidate.total_evidence_count,
        'distinctConventionCount', candidate.distinct_convention_count,
        'dominanceRatio', round(candidate.dominance_ratio, 4)
      ),
      public._organization_memory_confidence_from_signal(candidate.evidence_count, candidate.dominance_ratio),
      'commercial_sensitive',
      'organization'
    );

    foreach source_event_id in array candidate.source_event_ids
    loop
      perform public.link_organization_memory_evidence(jsonb_build_object(
        'organizationId', candidate.organization_id,
        'organizationMemoryItemId', memory_item_id,
        'sourceEventId', source_event_id,
        'linkType', 'supporting',
        'note', pattern_note
      ));
    end loop;

    module_takeoff_superseded := module_takeoff_superseded + public._organization_memory_mark_superseded_conflicts(
      candidate.organization_id,
      'takeoff_convention',
      'takeoff_page_calibration_convention',
      candidate.pattern_scope_key,
      memory_item_id,
      'Superseded by a stronger repeated takeoff calibration convention.'
    );
    module_takeoff_count := module_takeoff_count + 1;
  end loop;

  return jsonb_build_object(
    'organizationId', resolved_organization_id,
    'ranAt', now(),
    'modules', jsonb_build_object(
      'costItemClassificationCorrections', jsonb_build_object(
        'patternsApplied', module_cost_item_count,
        'patternsSuperseded', module_cost_item_superseded
      ),
      'costCodeMappings', jsonb_build_object(
        'patternsApplied', module_cost_code_count,
        'patternsSuperseded', module_cost_code_superseded
      ),
      'pricingWorksheetStructures', jsonb_build_object(
        'patternsApplied', module_worksheet_count,
        'patternsSuperseded', module_worksheet_superseded
      ),
      'supplierInvoiceMatching', jsonb_build_object(
        'patternsApplied', module_supplier_invoice_count,
        'patternsSuperseded', module_supplier_invoice_superseded
      ),
      'takeoffCalibrations', jsonb_build_object(
        'patternsApplied', module_takeoff_count,
        'patternsSuperseded', module_takeoff_superseded
      )
    )
  );
end;
$$;
