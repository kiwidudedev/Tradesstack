-- Reconcile Airbourne Road's pre-worksheet accepted quote as manual pricing.
-- The accepted quote and its two lines predate every persisted workbook, and
-- neither line has worksheet source evidence. SAFE DEFAULT: rollback.

begin;

do $preflight$
#variable_conflict use_variable
declare
  apply_changes boolean := false;
  organization_id constant uuid := '5c5de347-9f21-48fa-aac9-ba87e91fe92a';
  opportunity_id constant uuid := 'a916c53b-70d0-4535-8c2c-c4099d4d9d6b';
  project_id constant uuid := '3e70f9b8-6396-44f3-894c-8067c27cd2a7';
  accepted_quote_id constant uuid := 'ca1224a1-a312-45fb-a1cb-1ec7a45d5266';
  actor_user_id constant uuid := '374ae39f-836c-4022-93fd-1fcce50fdbed';
begin
  if exists (
    select 1 from public.opportunity_award_pricing_manifests manifest
    where manifest.organization_id = organization_id
      and manifest.opportunity_id = opportunity_id
  ) then
    -- Already reconciled: this script is an idempotent no-op.
    perform set_config('tradesstack.airbourne_reconcile_expected', '0', true);
  else
    if not exists (
      select 1 from public.opportunity_final_projects mapping
      join public.project_quotes quote
        on quote.organization_id = mapping.organization_id
       and quote.id = mapping.accepted_quote_id
      where mapping.organization_id = organization_id
        and mapping.opportunity_id = opportunity_id
        and mapping.project_id = project_id
        and mapping.accepted_quote_id = accepted_quote_id
        and quote.status = 'Accepted'
        and quote.project_id = project_id
        and quote.originating_opportunity_id = opportunity_id
        and quote.award_locked_at is null
    ) then
      raise exception 'Airbourne reconciliation stopped: accepted quote mapping changed';
    end if;

    if (select count(*) from public.project_quote_line_items line
        where line.organization_id = organization_id
          and line.quote_id = accepted_quote_id
          and line.pricing_source_kind = 'unresolved') <> 2 then
      raise exception 'Airbourne reconciliation stopped: expected exactly two unresolved accepted lines';
    end if;

    if exists (
      select 1 from public.commercial_item_document_links link
      where link.organization_id = organization_id
        and link.document_kind = 'quote_line'
        and link.link_role = 'source'
        and link.document_id = accepted_quote_id
    ) then
      raise exception 'Airbourne reconciliation stopped: worksheet source evidence now exists';
    end if;

    if exists (
      select 1
      from public.opportunity_pricing_worksheets workbook
      join public.project_quote_line_items line
        on line.organization_id = workbook.organization_id
       and line.quote_id = accepted_quote_id
      where workbook.organization_id = organization_id
        and workbook.opportunity_id = opportunity_id
        and workbook.created_at <= line.created_at
    ) then
      raise exception 'Airbourne reconciliation stopped: a workbook may predate an accepted quote line';
    end if;

    perform set_config('tradesstack.airbourne_reconcile_expected', '1', true);
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('tradesstack.airbourne_reconcile_apply', case when apply_changes then 'on' else 'off' end, true);
end;
$preflight$;

create temporary table airbourne_quote_before on commit drop as
select subtotal, gst_amount, total_quote_price, status, award_locked_at
from public.project_quotes
where organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a'
  and id = 'ca1224a1-a312-45fb-a1cb-1ec7a45d5266';

update public.project_quote_line_items
set pricing_source_kind = 'manual'
where current_setting('tradesstack.airbourne_reconcile_expected', true) = '1'
  and organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a'
  and quote_id = 'ca1224a1-a312-45fb-a1cb-1ec7a45d5266'
  and pricing_source_kind = 'unresolved';

create temporary table airbourne_finalized on commit drop as
select finalized.*
from public.finalize_opportunity_award_pricing_v1(
  '5c5de347-9f21-48fa-aac9-ba87e91fe92a',
  'a916c53b-70d0-4535-8c2c-c4099d4d9d6b',
  '3e70f9b8-6396-44f3-894c-8067c27cd2a7',
  'ca1224a1-a312-45fb-a1cb-1ec7a45d5266'
) finalized
where current_setting('tradesstack.airbourne_reconcile_expected', true) = '1';

do $verify$
declare
  expected integer := coalesce(current_setting('tradesstack.airbourne_reconcile_expected', true), '0')::integer;
  apply_changes boolean := current_setting('tradesstack.airbourne_reconcile_apply', true) = 'on';
begin
  if (select count(*) from airbourne_finalized) <> expected then
    raise exception 'Airbourne reconciliation finalizer count changed';
  end if;

  if expected = 1 and not exists (
    select 1 from public.opportunity_award_pricing_manifests manifest
    where manifest.organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a'
      and manifest.opportunity_id = 'a916c53b-70d0-4535-8c2c-c4099d4d9d6b'
      and manifest.classification = 'MANUAL_ONLY'
      and manifest.source_workbook_count = 0
      and manifest.manual_line_count = 2
  ) then
    raise exception 'Airbourne reconciliation did not create the expected manual-only manifest';
  end if;

  if expected = 1 and exists (
    select 1
    from airbourne_quote_before before_state
    join public.project_quotes quote
      on quote.organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a'
     and quote.id = 'ca1224a1-a312-45fb-a1cb-1ec7a45d5266'
    where quote.subtotal is distinct from before_state.subtotal
       or quote.gst_amount is distinct from before_state.gst_amount
       or quote.total_quote_price is distinct from before_state.total_quote_price
       or quote.status is distinct from before_state.status
  ) then
    raise exception 'Airbourne accepted quote financial history changed';
  end if;

  if (select count(*) from public.opportunity_award_pricing_manifests
      where organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a') <> 6 then
    raise exception 'Airbourne reconciliation manifest count changed';
  end if;

  raise notice 'Validated Airbourne historical award reconciliation (apply %, finalized %).', apply_changes, expected;
end;
$verify$;

-- SAFE DEFAULT.
rollback;
