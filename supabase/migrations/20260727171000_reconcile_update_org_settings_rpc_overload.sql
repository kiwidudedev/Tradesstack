-- Upgrade-path reconciliation for databases that recorded the historical
-- overload-cleanup migration before its clean-install prerequisite correction.
-- A corrected clean install has already removed this legacy signature, so this
-- statement is an idempotent no-op there. Existing databases are brought to the
-- same single-signature state without changing the canonical SECURITY DEFINER
-- function, its permissions, or its business logic.

begin;

drop function if exists public.update_organization_settings(uuid, text, text);

commit;
