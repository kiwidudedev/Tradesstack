alter table public.organization_clients
add column if not exists tags text[] not null default '{}';
