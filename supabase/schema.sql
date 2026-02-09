-- TradesStack schema (NZ sole traders)
-- This schema is intentionally simple and matches the TypeScript models in /types/models.ts.

create extension if not exists "pgcrypto";

-- Profiles / settings for each authenticated user
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  gst_registered boolean not null default true,
  gst_rate numeric(5,2) not null default 15.00,
  acc_rate numeric(5,2) not null default 1.60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active','on_hold','completed')),
  site_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined')),
  gst_rate numeric(5,2) not null default 15.00,
  subtotal numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','paid')),
  gst_rate numeric(5,2) not null default 15.00,
  subtotal numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  due_date date,
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  supplier_name text not null,
  title text not null,
  gst_rate numeric(5,2) not null default 15.00,
  subtotal numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  line_items jsonb not null default '[]'::jsonb,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.safety_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  type text not null check (type in ('toolbox_talk','checklist')),
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Simple updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_users_updated_at'
  ) then
    create trigger set_users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_clients_updated_at'
  ) then
    create trigger set_clients_updated_at
    before update on public.clients
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_jobs_updated_at'
  ) then
    create trigger set_jobs_updated_at
    before update on public.jobs
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_quotes_updated_at'
  ) then
    create trigger set_quotes_updated_at
    before update on public.quotes
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_invoices_updated_at'
  ) then
    create trigger set_invoices_updated_at
    before update on public.invoices
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_purchase_orders_updated_at'
  ) then
    create trigger set_purchase_orders_updated_at
    before update on public.purchase_orders
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_safety_records_updated_at'
  ) then
    create trigger set_safety_records_updated_at
    before update on public.safety_records
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- NOTE: Row Level Security policies are not included here yet.
