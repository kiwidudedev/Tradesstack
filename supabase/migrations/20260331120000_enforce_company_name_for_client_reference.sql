-- Client reference should always be company_name.
-- Preserve existing contact names in "name" and backfill missing company names.

update public.organization_clients
set company_name = nullif(trim(name), '')
where company_name is null or trim(company_name) = '';

alter table public.organization_clients
alter column company_name set not null;

alter table public.organization_clients
drop constraint if exists organization_clients_company_name_not_blank;

alter table public.organization_clients
add constraint organization_clients_company_name_not_blank
check (char_length(trim(company_name)) > 0);
