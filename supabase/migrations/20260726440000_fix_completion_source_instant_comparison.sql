-- Proposal optimistic revisions use ISO-8601 `Z`, while PostgreSQL renders
-- timestamptz text with `+00`. Compare instants, not their formatting.
--
-- Historical clean-install correction: development originally applied the
-- preceding migration with text comparisons, so the exact replacements below
-- succeeded there. The current zero-based chain already has the intended
-- timestamptz comparisons, formatted across multiple lines. Exact one-line
-- source matching therefore rejected an already-correct function before any
-- later migration could run. Resolve the exact signature and normalize only
-- whitespace for validation, while still failing closed for a missing or
-- incompatible function. This preserves the migration's original behaviour.

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_normalized text;
  v_payment_is_old boolean;
  v_payment_is_correct boolean;
  v_retention_is_old boolean;
  v_retention_is_correct boolean;
begin
  v_signature := to_regprocedure(
    'public.get_accounting_sync_completion_evidence(uuid,uuid)'
  );

  if v_signature is null then
    raise exception
      'The Accounting Sync completion evidence function was not found.';
  end if;

  v_definition := pg_get_functiondef(v_signature);
  v_normalized := regexp_replace(v_definition, '[[:space:]]+', ' ', 'g');

  v_payment_is_old := position(
    'select claim.updated_at::text = v_proposal.source_optimistic_revision'
    in v_normalized
  ) > 0;
  v_payment_is_correct := position(
    'select claim.updated_at = v_proposal.source_optimistic_revision::timestamptz'
    in v_normalized
  ) > 0;
  v_retention_is_old := position(
    'select claim.submitted_at::text = v_proposal.source_optimistic_revision'
    in v_normalized
  ) > 0;
  v_retention_is_correct := position(
    'select claim.submitted_at = v_proposal.source_optimistic_revision::timestamptz'
    in v_normalized
  ) > 0;

  if not (v_payment_is_old or v_payment_is_correct)
    or not (v_retention_is_old or v_retention_is_correct)
  then
    raise exception
      'The Accounting Sync completion source comparison was not found.';
  end if;

  v_updated := regexp_replace(
    v_definition,
    'select[[:space:]]+claim[.]updated_at::text[[:space:]]*=[[:space:]]*v_proposal[.]source_optimistic_revision',
    'select claim.updated_at = v_proposal.source_optimistic_revision::timestamptz',
    'g'
  );
  v_updated := regexp_replace(
    v_updated,
    'select[[:space:]]+claim[.]submitted_at::text[[:space:]]*=[[:space:]]*v_proposal[.]source_optimistic_revision',
    'select claim.submitted_at = v_proposal.source_optimistic_revision::timestamptz',
    'g'
  );

  v_normalized := regexp_replace(v_updated, '[[:space:]]+', ' ', 'g');
  if position(
    'select claim.updated_at = v_proposal.source_optimistic_revision::timestamptz'
    in v_normalized
  ) = 0
    or position(
      'select claim.submitted_at = v_proposal.source_optimistic_revision::timestamptz'
      in v_normalized
    ) = 0
  then
    raise exception
      'The Accounting Sync completion source comparison could not be corrected safely.';
  end if;

  if v_updated is distinct from v_definition then
    execute v_updated;
  end if;
end;
$$;

revoke all on function public.get_accounting_sync_completion_evidence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_accounting_sync_completion_evidence(uuid, uuid)
  to service_role;
