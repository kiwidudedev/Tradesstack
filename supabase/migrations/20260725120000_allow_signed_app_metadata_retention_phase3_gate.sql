-- Allow normal Supabase user sessions to carry the Phase 3 internal Retention
-- gate as an admin-managed, signed app_metadata claim. Existing top-level
-- internal claims remain supported for workers and characterization tests.

create or replace function private.retention_claim_phase3_gate_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      current_setting('request.jwt.claim.retention_phase3_internal', true),
      ''
    ) = 'true'
    or coalesce(
      (
        coalesce(
          nullif(current_setting('request.jwt.claims', true), ''),
          '{}'
        )::jsonb ->> 'retention_phase3_internal'
      ),
      'false'
    ) = 'true'
    or coalesce(
      (
        coalesce(
          nullif(current_setting('request.jwt.claims', true), ''),
          '{}'
        )::jsonb #>> '{app_metadata,retention_phase3_internal}'
      ),
      'false'
    ) = 'true';
$$;

revoke all on function private.retention_claim_phase3_gate_enabled()
  from public, anon, authenticated;
