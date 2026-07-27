alter table public.project_quotes
  add column if not exists retention_percent_default numeric(7,3) not null default 0;

update public.project_quotes
set retention_percent_default = 0
where retention_percent_default is null;
