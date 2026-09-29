-- Metro Ceilings Fitout conversion reconciliation.
--
-- Audit verdict:
--   Project 26026 is canonical because it contains user-created claim 26026-CL-01.
--   Project 26029 is a later partial-conversion duplicate with only seeded rows.
--
-- SAFE DEFAULT: validates the exact audited shape and rolls back. To apply,
-- deliberately set apply_changes := true and change the final ROLLBACK to COMMIT.
-- Project 26029 and its storage object are intentionally retained.

begin;

do $reconcile$
#variable_conflict use_variable
declare
  apply_changes boolean := false;
  organization_id constant uuid := '5c5de347-9f21-48fa-aac9-ba87e91fe92a';
  opportunity_id constant uuid := '5a8e24a4-a69b-4bb1-89e9-5eb319d69e34';
  workspace_project_id constant uuid := '7f2d198d-af79-4f2e-8428-05ea1e056674';
  canonical_project_id constant uuid := '897a35eb-250b-477e-9967-6633533abbfe';
  duplicate_project_id constant uuid := '3ff2ea5b-8db9-4ba6-b459-0f3c705a778f';
  accepted_quote_id constant uuid := '8b1b498c-0cd0-49ae-945f-e70aea86d28f';
  preserved_claim_id constant uuid := '1ef77a9c-bf6e-4bc4-8a83-6989f94a764a';
  actor_user_id uuid;
  candidate_ids uuid[];
  row_count_value integer;
  already_reconciled boolean := false;
  attached record;
begin
  select project.created_by into actor_user_id
  from public.organization_projects project
  where project.id = canonical_project_id
    and project.organization_id = organization_id
    and project.source_opportunity_id = opportunity_id
    and project.slug = 'metro-ceilings-fitout'
    and project.project_code = '26026'
    and project.name = 'Metro Ceilings Fitout'
    and project.stage = 'Pricing';
  if actor_user_id is null then
    raise exception 'Reconciliation stopped: canonical Project 26026 differs from the audit';
  end if;

  perform 1 from public.organization_projects project
  where project.id = duplicate_project_id
    and project.organization_id = organization_id
    and project.source_opportunity_id = opportunity_id
    and project.slug = 'metro-ceilings-fitout-2'
    and project.project_code = '26029'
    and project.name = 'Metro Ceilings Fitout'
    and project.stage = 'Pricing';
  if not found then
    raise exception 'Reconciliation stopped: duplicate Project 26029 differs from the audit';
  end if;

  perform 1 from public.organization_projects workspace
  where workspace.id = workspace_project_id
    and workspace.organization_id = organization_id
    and workspace.source_opportunity_id = opportunity_id
    and workspace.slug = 'metro-ceilings-fitout-tender'
    and workspace.project_code = '26025';
  if not found then
    raise exception 'Reconciliation stopped: tender workspace lineage differs from the audit';
  end if;

  select array_agg(project.id order by project.id) into candidate_ids
  from public.organization_projects project
  where project.organization_id = organization_id
    and project.source_opportunity_id = opportunity_id
    and project.id <> workspace_project_id;
  if candidate_ids is distinct from array[duplicate_project_id, canonical_project_id]::uuid[]
    and candidate_ids is distinct from array[canonical_project_id, duplicate_project_id]::uuid[]
  then
    raise exception 'Reconciliation stopped: delivery candidate set changed: %', candidate_ids;
  end if;

  -- This independently created draft claim is the non-temporal evidence that
  -- Project 26026 became the real delivery workspace. It must never be moved.
  perform 1 from public.project_claims claim
  where claim.id = preserved_claim_id
    and claim.organization_id = organization_id
    and claim.project_id = canonical_project_id
    and claim.claim_number = '26026-CL-01'
    and claim.claim_title = 'New Claim'
    and claim.status = 'Draft'
    and claim.claim_amount = 0
    and claim.total_payable = 0
    and claim.paid_amount = 0
    and claim.created_by = actor_user_id;
  if not found then
    raise exception 'Reconciliation stopped: user-created Project 26026 claim differs from the audit';
  end if;
  select count(*) into row_count_value from public.project_claims claim
  where claim.organization_id = organization_id
    and claim.project_id in (canonical_project_id, duplicate_project_id);
  if row_count_value <> 1
    or exists (select 1 from public.project_claim_line_items line where line.claim_id = preserved_claim_id)
    or exists (select 1 from public.organization_accounting_documents document where document.project_claim_id = preserved_claim_id)
  then
    raise exception 'Reconciliation stopped: preserved Project 26026 claim shape changed';
  end if;

  select count(*) into row_count_value from public.project_drawing_sets drawing
  where drawing.organization_id = organization_id
    and drawing.project_id in (canonical_project_id, duplicate_project_id)
    and drawing.storage_path like (
      organization_id::text || '/' || drawing.project_id::text
      || '/%tradesstack-house-internal-linings-trade-pack.pdf'
    );
  if row_count_value <> 2 then
    raise exception 'Reconciliation stopped: expected one cloned tender drawing per candidate';
  end if;

  select count(*) into row_count_value from storage.objects object
  where object.bucket_id = 'project-drawing-sets'
    and (object.name like organization_id::text || '/' || canonical_project_id::text || '/%'
      or object.name like organization_id::text || '/' || duplicate_project_id::text || '/%');
  if row_count_value <> 2 then
    raise exception 'Reconciliation stopped: expected one preserved storage object per candidate';
  end if;

  select count(*) into row_count_value from public.trade_pack_workspaces workspace
  where workspace.organization_id = organization_id
    and workspace.legacy_project_id in (canonical_project_id, duplicate_project_id);
  if row_count_value <> 2 then
    raise exception 'Reconciliation stopped: seeded trade-pack workspace shape changed';
  end if;
  select count(*) into row_count_value from public.project_retention_workflow_states workflow
  where workflow.organization_id = organization_id
    and workflow.project_id in (canonical_project_id, duplicate_project_id)
    and workflow.mode = 'observe';
  if row_count_value <> 2 then
    raise exception 'Reconciliation stopped: seeded retention workflow shape changed';
  end if;

  -- The full catalog audit found no other independently authored candidate data.
  if exists (select 1 from public.project_quotes quote where quote.organization_id = organization_id and quote.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.commercial_items item where item.organization_id = organization_id and item.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.cost_items item where item.organization_id = organization_id and item.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.opportunity_pricing_worksheets workbook where workbook.organization_id = organization_id and workbook.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_variations variation where variation.organization_id = organization_id and variation.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_purchase_orders purchase_order where purchase_order.organization_id = organization_id and purchase_order.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.retention_claims claim where claim.organization_id = organization_id and claim.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.supplier_invoice_lines invoice where invoice.organization_id = organization_id and invoice.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_job_todos todo where todo.organization_id = organization_id and todo.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_time_sheet_entries entry where entry.organization_id = organization_id and entry.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_quality_inspections inspection where inspection.organization_id = organization_id and inspection.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_quality_issues issue where issue.organization_id = organization_id and issue.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.project_members member where member.organization_id = organization_id and member.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.worker_project_assignments assignment where assignment.organization_id = organization_id and assignment.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.organization_tradesstack_accounting_mappings mapping where mapping.organization_id = organization_id and mapping.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.document_workspace_entities entity where entity.organization_id = organization_id and entity.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.trade_packs pack where pack.organization_id = organization_id and pack.project_id in (canonical_project_id, duplicate_project_id))
    or exists (select 1 from public.scope_runs run where run.organization_id = organization_id and run.project_id in (canonical_project_id, duplicate_project_id))
  then
    raise exception 'Reconciliation stopped: candidate business data changed after the audit';
  end if;

  select opportunity.converted_project_id = canonical_project_id
      and opportunity.converted_at is not null
      and opportunity.stage = 'Won'
    into already_reconciled
  from public.organization_opportunities opportunity
  where opportunity.id = opportunity_id
    and opportunity.organization_id = organization_id
    and opportunity.workspace_project_id = workspace_project_id
  for update;
  if not found then
    raise exception 'Reconciliation stopped: Opportunity is missing or workspace changed';
  end if;

  if already_reconciled then
    perform 1 from public.opportunity_final_projects mapping
    where mapping.organization_id = organization_id
      and mapping.opportunity_id = opportunity_id
      and mapping.project_id = canonical_project_id
      and mapping.accepted_quote_id = accepted_quote_id;
    if not found then
      raise exception 'Reconciliation stopped: completed canonical mapping is inconsistent';
    end if;
    perform 1 from public.opportunity_award_pricing_manifests manifest
    where manifest.organization_id = organization_id
      and manifest.opportunity_id = opportunity_id
      and manifest.project_id = canonical_project_id
      and manifest.accepted_quote_id = accepted_quote_id
      and manifest.working_quote_id is not null;
    if not found then
      raise exception 'Reconciliation stopped: completed award manifest is inconsistent';
    end if;
    raise notice 'Metro reconciliation is already complete and consistent.';
  else
    perform 1 from public.organization_opportunities opportunity
    where opportunity.id = opportunity_id
      and opportunity.organization_id = organization_id
      and opportunity.converted_project_id is null
      and opportunity.converted_at is null
      and opportunity.stage = 'Quoted';
    if not found then
      raise exception 'Reconciliation stopped: Opportunity state differs from pre-conversion audit';
    end if;

    perform 1 from public.project_quotes quote
    where quote.id = accepted_quote_id
      and quote.organization_id = organization_id
      and quote.originating_opportunity_id = opportunity_id
      and quote.quote_number = 'Q-26017-4'
      and quote.status = 'Accepted'
      and quote.project_id is null
      and quote.award_locked_at is null;
    if not found then
      raise exception 'Reconciliation stopped: Q-26017-4 must be saved as Accepted before applying';
    end if;

    if exists (select 1 from public.opportunity_final_projects mapping where mapping.organization_id = organization_id and mapping.opportunity_id = opportunity_id)
      or exists (select 1 from public.opportunity_award_pricing_manifests manifest where manifest.organization_id = organization_id and manifest.opportunity_id = opportunity_id)
      or exists (select 1 from public.opportunity_award_pricing_reconciliation_ledger ledger where ledger.organization_id = organization_id and ledger.opportunity_id = opportunity_id)
    then
      raise exception 'Reconciliation stopped: partial new-lifecycle state appeared after audit';
    end if;

    select count(*) into row_count_value from public.commercial_items item
    where item.organization_id = organization_id
      and item.opportunity_id = opportunity_id
      and not public.validate_commercial_item_source_link_json(item.source_link_json);
    if row_count_value <> 10 then
      raise exception 'Reconciliation stopped: expected ten legacy source links, found %', row_count_value;
    end if;
    if exists (
      select 1 from public.commercial_items item
      where item.organization_id = organization_id
        and item.opportunity_id = opportunity_id
        and not public.validate_commercial_item_source_link_json(item.source_link_json)
        and not public.validate_commercial_item_source_link_json(
          item.source_link_json || jsonb_build_object(
            'ownerType', 'opportunity', 'opportunityId', opportunity_id,
            'opportunitySlug', 'metro-ceilings-fitout',
            'projectId', workspace_project_id, 'projectSlug', 'metro-ceilings-fitout-tender',
            'quoteId', null, 'variationId', null
          )
        )
    ) then
      raise exception 'Reconciliation stopped: legacy source links cannot be normalized deterministically';
    end if;

    raise notice 'Validated Project 26026 as canonical; Project 26029 remains preserved.';
    if apply_changes then
      perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
      update public.commercial_items item
      set source_link_json = item.source_link_json || jsonb_build_object(
        'ownerType', 'opportunity', 'opportunityId', opportunity_id,
        'opportunitySlug', 'metro-ceilings-fitout',
        'projectId', workspace_project_id, 'projectSlug', 'metro-ceilings-fitout-tender',
        'quoteId', null, 'variationId', null
      )
      where item.organization_id = organization_id
        and item.opportunity_id = opportunity_id
        and not public.validate_commercial_item_source_link_json(item.source_link_json);
      get diagnostics row_count_value = row_count;
      if row_count_value <> 10 then
        raise exception 'Reconciliation stopped: normalized %, expected 10', row_count_value;
      end if;

      insert into public.opportunity_final_projects (
        opportunity_id, organization_id, project_id, accepted_quote_id, created_by
      ) values (
        opportunity_id, organization_id, canonical_project_id, accepted_quote_id, actor_user_id
      );

      select * into attached
      from public.attach_opportunity_commercial_history_to_project(
        organization_id, opportunity_id, canonical_project_id
      );
      perform public.ensure_opportunity_project_document_workspace(opportunity_id, canonical_project_id);

      update public.organization_opportunities opportunity
      set converted_project_id = canonical_project_id,
          converted_at = timezone('utc', now()),
          stage = 'Won',
          quoted_at = coalesce(opportunity.quoted_at, current_date)
      where opportunity.id = opportunity_id and opportunity.organization_id = organization_id;

      select count(*) into row_count_value from public.opportunity_final_projects mapping
      where mapping.organization_id = organization_id and mapping.opportunity_id = opportunity_id;
      if row_count_value <> 1 then raise exception 'Expected exactly one final Project mapping'; end if;
      select count(*) into row_count_value from public.opportunity_award_pricing_manifests manifest
      where manifest.organization_id = organization_id and manifest.opportunity_id = opportunity_id;
      if row_count_value <> 1 then raise exception 'Expected exactly one award manifest'; end if;
      perform 1 from public.project_claims claim where claim.id = preserved_claim_id and claim.project_id = canonical_project_id;
      if not found then raise exception 'Preserved Project 26026 claim moved unexpectedly'; end if;

      raise notice 'Reconciled Metro to Project 26026: quotes %, lines %, commercial items %.',
        attached.attached_quote_count, attached.attached_quote_line_count,
        attached.attached_commercial_item_count;
    else
      raise notice 'Dry run only. No reconciliation changes requested.';
    end if;
  end if;
end;
$reconcile$;

-- SAFE DEFAULT. Change to COMMIT only with apply_changes deliberately true.
rollback;

-- Project 26029 remains linked to the source Opportunity as historical evidence.
-- opportunity_final_projects is the authoritative classification of Project 26026.
