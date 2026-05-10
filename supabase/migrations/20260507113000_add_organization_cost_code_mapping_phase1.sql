begin;

create table if not exists public.organization_cost_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid null references auth.users (id) on delete set null,
  code text not null,
  name text not null,
  description text null,
  external_provider text null,
  external_code text null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_cost_codes_code_not_blank check (char_length(trim(code)) > 0),
  constraint organization_cost_codes_name_not_blank check (char_length(trim(name)) > 0),
  constraint organization_cost_codes_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint organization_cost_codes_external_provider_check check (
    external_provider is null
    or external_provider in ('manual', 'csv', 'xero')
  ),
  constraint organization_cost_codes_unique_code_per_org unique (organization_id, code),
  constraint organization_cost_codes_org_id_unique unique (organization_id, id)
);

create index if not exists organization_cost_codes_org_active_idx
  on public.organization_cost_codes (organization_id, is_active, sort_order, created_at desc);

create index if not exists organization_cost_codes_external_provider_idx
  on public.organization_cost_codes (organization_id, external_provider, external_code)
  where external_provider is not null;

create unique index if not exists organization_cost_codes_default_per_org_uidx
  on public.organization_cost_codes (organization_id)
  where is_default = true and is_active = true;

drop trigger if exists set_organization_cost_codes_updated_at on public.organization_cost_codes;
create trigger set_organization_cost_codes_updated_at
before update on public.organization_cost_codes
for each row execute function public.set_updated_at();

create table if not exists public.organization_cost_code_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid null references auth.users (id) on delete set null,
  rule_type text not null,
  priority integer not null default 100,
  target_cost_code_id uuid not null,
  intelligence_cost_code text null,
  work_type text null,
  cost_type text null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_cost_code_mapping_rules_priority_positive_check check (priority > 0),
  constraint organization_cost_code_mapping_rules_rule_type_check check (
    rule_type in ('direct_cost_item_code', 'work_type_cost_type', 'work_type', 'cost_type', 'default')
  ),
  constraint organization_cost_code_mapping_rules_selector_check check (
    (
      rule_type = 'direct_cost_item_code'
      and intelligence_cost_code is not null
      and char_length(trim(intelligence_cost_code)) > 0
      and work_type is null
      and cost_type is null
    )
    or (
      rule_type = 'work_type_cost_type'
      and work_type is not null
      and char_length(trim(work_type)) > 0
      and cost_type is not null
      and char_length(trim(cost_type)) > 0
      and intelligence_cost_code is null
    )
    or (
      rule_type = 'work_type'
      and work_type is not null
      and char_length(trim(work_type)) > 0
      and cost_type is null
      and intelligence_cost_code is null
    )
    or (
      rule_type = 'cost_type'
      and cost_type is not null
      and char_length(trim(cost_type)) > 0
      and work_type is null
      and intelligence_cost_code is null
    )
    or (
      rule_type = 'default'
      and intelligence_cost_code is null
      and work_type is null
      and cost_type is null
    )
  ),
  constraint organization_cost_code_mapping_rules_target_cost_code_fkey
    foreign key (organization_id, target_cost_code_id)
    references public.organization_cost_codes (organization_id, id)
    on delete cascade
);

create index if not exists organization_cost_code_mapping_rules_org_active_priority_idx
  on public.organization_cost_code_mapping_rules (organization_id, is_active, rule_type, priority, created_at desc);

create index if not exists organization_cost_code_mapping_rules_direct_code_idx
  on public.organization_cost_code_mapping_rules (organization_id, intelligence_cost_code, priority)
  where is_active = true and intelligence_cost_code is not null;

create index if not exists organization_cost_code_mapping_rules_work_type_cost_type_idx
  on public.organization_cost_code_mapping_rules (organization_id, work_type, cost_type, priority)
  where is_active = true and work_type is not null and cost_type is not null;

create index if not exists organization_cost_code_mapping_rules_work_type_idx
  on public.organization_cost_code_mapping_rules (organization_id, work_type, priority)
  where is_active = true and work_type is not null and cost_type is null;

create index if not exists organization_cost_code_mapping_rules_cost_type_idx
  on public.organization_cost_code_mapping_rules (organization_id, cost_type, priority)
  where is_active = true and cost_type is not null and work_type is null;

create unique index if not exists organization_cost_code_mapping_rules_active_selector_uidx
  on public.organization_cost_code_mapping_rules (
    organization_id,
    rule_type,
    coalesce(intelligence_cost_code, ''),
    coalesce(work_type, ''),
    coalesce(cost_type, '')
  )
  where is_active = true;

drop trigger if exists set_organization_cost_code_mapping_rules_updated_at on public.organization_cost_code_mapping_rules;
create trigger set_organization_cost_code_mapping_rules_updated_at
before update on public.organization_cost_code_mapping_rules
for each row execute function public.set_updated_at();

alter table public.organization_cost_codes enable row level security;
alter table public.organization_cost_codes force row level security;
alter table public.organization_cost_code_mapping_rules enable row level security;
alter table public.organization_cost_code_mapping_rules force row level security;

drop policy if exists "Members can view organization cost codes" on public.organization_cost_codes;
create policy "Members can view organization cost codes"
on public.organization_cost_codes
for select
to authenticated
using (public.is_member_of_organization(organization_cost_codes.organization_id));

drop policy if exists "Admins can create organization cost codes" on public.organization_cost_codes;
create policy "Admins can create organization cost codes"
on public.organization_cost_codes
for insert
to authenticated
with check (
  public.has_org_permission(organization_cost_codes.organization_id, 'settings.organization.update')
);

drop policy if exists "Admins can update organization cost codes" on public.organization_cost_codes;
create policy "Admins can update organization cost codes"
on public.organization_cost_codes
for update
to authenticated
using (
  public.has_org_permission(organization_cost_codes.organization_id, 'settings.organization.update')
)
with check (
  public.has_org_permission(organization_cost_codes.organization_id, 'settings.organization.update')
);

drop policy if exists "Admins can delete organization cost codes" on public.organization_cost_codes;
create policy "Admins can delete organization cost codes"
on public.organization_cost_codes
for delete
to authenticated
using (
  public.has_org_permission(organization_cost_codes.organization_id, 'settings.organization.update')
);

drop policy if exists "Members can view organization cost code mapping rules" on public.organization_cost_code_mapping_rules;
create policy "Members can view organization cost code mapping rules"
on public.organization_cost_code_mapping_rules
for select
to authenticated
using (public.is_member_of_organization(organization_cost_code_mapping_rules.organization_id));

drop policy if exists "Admins can create organization cost code mapping rules" on public.organization_cost_code_mapping_rules;
create policy "Admins can create organization cost code mapping rules"
on public.organization_cost_code_mapping_rules
for insert
to authenticated
with check (
  public.has_org_permission(organization_cost_code_mapping_rules.organization_id, 'settings.organization.update')
);

drop policy if exists "Admins can update organization cost code mapping rules" on public.organization_cost_code_mapping_rules;
create policy "Admins can update organization cost code mapping rules"
on public.organization_cost_code_mapping_rules
for update
to authenticated
using (
  public.has_org_permission(organization_cost_code_mapping_rules.organization_id, 'settings.organization.update')
)
with check (
  public.has_org_permission(organization_cost_code_mapping_rules.organization_id, 'settings.organization.update')
);

drop policy if exists "Admins can delete organization cost code mapping rules" on public.organization_cost_code_mapping_rules;
create policy "Admins can delete organization cost code mapping rules"
on public.organization_cost_code_mapping_rules
for delete
to authenticated
using (
  public.has_org_permission(organization_cost_code_mapping_rules.organization_id, 'settings.organization.update')
);

grant select, insert, update, delete on public.organization_cost_codes to authenticated;
grant select, insert, update, delete on public.organization_cost_code_mapping_rules to authenticated;

commit;
