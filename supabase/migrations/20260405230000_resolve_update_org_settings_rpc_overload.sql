-- Long-term PostgREST compatibility fix:
-- Remove overloaded RPC signature that causes PGRST203 ambiguity.

begin;

-- Keep only the extended signature used by current app code.
drop function if exists public.update_organization_settings(uuid, text, text);

-- Ensure execute grant remains on the canonical function.
grant execute on function public.update_organization_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
) to authenticated;

comment on function public.update_organization_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
) is 'Canonical organization settings RPC. Do not create overloaded variants; PostgREST cannot disambiguate overloaded RPCs by name.';

commit;
