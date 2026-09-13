-- REVIEWED STAGE 3 ROLLBACK CONTROL — DO NOT RUN DURING VERIFICATION.
--
-- Run only after the Stage 3 application creation cutover has been reverted.
-- This disables authoritative lifecycle creation and promotion for every
-- organization. The server then uses the preserved legacy creation path.
--
-- This does not delete, merge, reparent, relabel, or otherwise modify any
-- Opportunity, Project, lifecycle, quote, document, commercial, Xero, or
-- historical conversion record.

begin;

update public.opportunity_lifecycle_rollout_controls
set creation_enabled = false,
    promotion_enabled = false,
    updated_at = now();

do $$
begin
  if exists (
    select 1
    from public.opportunity_lifecycle_rollout_controls
    where creation_enabled or promotion_enabled
  ) then
    raise exception 'Stage 3 rollback control verification failed';
  end if;
end;
$$;

commit;
