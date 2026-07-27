-- Long-term PostgREST compatibility fix:
-- Remove overloaded RPC signature that causes PGRST203 ambiguity.

begin;

-- Keep only the extended signature used by current app code.
drop function if exists public.update_organization_settings(uuid, text, text);

-- Historical clean-install correction: the extended canonical function is
-- created by the immediately following 20260405234500 migration. Granting or
-- commenting on that signature here references an object that does not yet
-- exist and stops a database migrating from zero. The following migration
-- creates the function and applies both statements. Omitting them here only
-- makes the existing migration chain executable; it does not change runtime
-- business behaviour.

commit;
