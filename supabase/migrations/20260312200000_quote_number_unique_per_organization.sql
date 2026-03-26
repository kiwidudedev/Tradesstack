alter table public.project_quotes
drop constraint if exists project_quotes_unique_number_per_project;

alter table public.project_quotes
add constraint project_quotes_unique_number_per_organization
unique (organization_id, quote_number);
