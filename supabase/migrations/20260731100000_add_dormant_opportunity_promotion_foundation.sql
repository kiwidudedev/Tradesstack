begin;

-- Stage 1 is deliberately dormant. No rollout rows are inserted by this
-- migration, and both new lifecycle entry points fail closed without one.
create table public.opportunity_lifecycle_rollout_controls (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  allowed_strategy text not null,
  creation_enabled boolean not null default false,
  promotion_enabled boolean not null default false,
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_lifecycle_rollout_strategy_check check (
    allowed_strategy in ('legacy_two_project_v1', 'promote_workspace_v1')
  )
);

alter table public.opportunity_lifecycle_rollout_controls enable row level security;
alter table public.opportunity_lifecycle_rollout_controls force row level security;

revoke all on public.opportunity_lifecycle_rollout_controls
from public, anon, authenticated;
grant select, insert, update, delete
on public.opportunity_lifecycle_rollout_controls
to service_role;

-- Composite keys let the new foundation enforce organization ownership in the
-- foreign keys themselves without changing any existing row.
create unique index if not exists organization_opportunities_org_id_id_uidx
  on public.organization_opportunities (organization_id, id);

create unique index if not exists organization_projects_org_id_id_uidx
  on public.organization_projects (organization_id, id);

create unique index if not exists project_quotes_org_id_id_uidx
  on public.project_quotes (organization_id, id);

create table public.opportunity_lifecycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  original_workspace_project_id uuid not null,
  strategy text not null,
  strategy_version smallint not null default 1,
  creation_request_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint opportunity_lifecycles_strategy_check check (
    strategy in ('legacy_two_project_v1', 'promote_workspace_v1')
  ),
  constraint opportunity_lifecycles_strategy_version_check check (
    strategy_version = 1
  ),
  constraint opportunity_lifecycles_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint opportunity_lifecycles_opportunity_fk
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id)
    on delete restrict,
  constraint opportunity_lifecycles_workspace_fk
    foreign key (organization_id, original_workspace_project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint opportunity_lifecycles_opportunity_unique unique (opportunity_id),
  constraint opportunity_lifecycles_workspace_unique
    unique (original_workspace_project_id),
  constraint opportunity_lifecycles_org_request_unique
    unique (organization_id, creation_request_id),
  constraint opportunity_lifecycles_org_id_unique
    unique (organization_id, id)
);

alter table public.opportunity_lifecycles enable row level security;
alter table public.opportunity_lifecycles force row level security;

create policy "Members can view Opportunity lifecycle evidence"
on public.opportunity_lifecycles
for select
to authenticated
using (public.is_member_of_organization(organization_id));

revoke all on public.opportunity_lifecycles from public, anon, authenticated;
grant select on public.opportunity_lifecycles to authenticated;
grant select, insert on public.opportunity_lifecycles to service_role;

create or replace function public.validate_opportunity_lifecycle_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_workspace_id uuid;
  project_source_opportunity_id uuid;
begin
  select opportunity.workspace_project_id
  into opportunity_workspace_id
  from public.organization_opportunities opportunity
  where opportunity.organization_id = new.organization_id
    and opportunity.id = new.opportunity_id
  for key share;

  if not found
    or opportunity_workspace_id is distinct from new.original_workspace_project_id
  then
    raise exception
      'Lifecycle workspace must equal the Opportunity workspace at creation'
      using errcode = 'TS409';
  end if;

  select project.source_opportunity_id
  into project_source_opportunity_id
  from public.organization_projects project
  where project.organization_id = new.organization_id
    and project.id = new.original_workspace_project_id
  for key share;

  if not found
    or project_source_opportunity_id is distinct from new.opportunity_id
  then
    raise exception
      'Lifecycle workspace must belong to the Opportunity'
      using errcode = 'TS409';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_opportunity_lifecycle_insert()
from public, anon, authenticated;

create trigger validate_opportunity_lifecycle_before_insert
before insert on public.opportunity_lifecycles
for each row execute function public.validate_opportunity_lifecycle_insert();

create or replace function public.prevent_opportunity_lifecycle_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Opportunity lifecycle records are immutable'
    using errcode = 'TS409';
end;
$$;

revoke all on function public.prevent_opportunity_lifecycle_mutation()
from public, anon, authenticated;

create trigger prevent_opportunity_lifecycle_update
before update on public.opportunity_lifecycles
for each row execute function public.prevent_opportunity_lifecycle_mutation();

create trigger prevent_opportunity_lifecycle_delete
before delete on public.opportunity_lifecycles
for each row execute function public.prevent_opportunity_lifecycle_mutation();

create table public.opportunity_promotion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lifecycle_id uuid not null,
  opportunity_id uuid not null,
  project_id uuid not null,
  accepted_quote_id uuid not null,
  strategy text not null,
  strategy_version smallint not null,
  correlation_id uuid not null,
  completed_by uuid not null references auth.users (id) on delete restrict,
  completed_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_promotion_events_strategy_check check (
    strategy = 'promote_workspace_v1'
  ),
  constraint opportunity_promotion_events_version_check check (
    strategy_version = 1
  ),
  constraint opportunity_promotion_events_lifecycle_fk
    foreign key (organization_id, lifecycle_id)
    references public.opportunity_lifecycles (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_events_opportunity_fk
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_events_project_fk
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_events_quote_fk
    foreign key (organization_id, accepted_quote_id)
    references public.project_quotes (organization_id, id)
    on delete restrict,
  constraint opportunity_promotion_events_opportunity_unique
    unique (opportunity_id),
  constraint opportunity_promotion_events_org_correlation_unique
    unique (organization_id, correlation_id)
);

alter table public.opportunity_promotion_events enable row level security;
alter table public.opportunity_promotion_events force row level security;

create policy "Members can view Opportunity promotion evidence"
on public.opportunity_promotion_events
for select
to authenticated
using (public.is_member_of_organization(organization_id));

revoke all on public.opportunity_promotion_events
from public, anon, authenticated;
grant select on public.opportunity_promotion_events to authenticated;
grant select, insert on public.opportunity_promotion_events to service_role;

create or replace function public.validate_opportunity_promotion_event_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lifecycle_row public.opportunity_lifecycles%rowtype;
  opportunity_row public.organization_opportunities%rowtype;
  quote_row public.project_quotes%rowtype;
  mapping_row public.opportunity_final_projects%rowtype;
begin
  select *
  into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = new.organization_id
    and lifecycle.id = new.lifecycle_id;

  if not found
    or lifecycle_row.opportunity_id <> new.opportunity_id
    or lifecycle_row.original_workspace_project_id <> new.project_id
    or lifecycle_row.strategy <> new.strategy
    or lifecycle_row.strategy_version <> new.strategy_version
  then
    raise exception 'Promotion event contradicts its lifecycle record'
      using errcode = 'TS409';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.organization_id = new.organization_id
    and opportunity.id = new.opportunity_id;

  if not found
    or opportunity_row.workspace_project_id is distinct from new.project_id
    or opportunity_row.converted_project_id is distinct from new.project_id
    or opportunity_row.stage <> 'Won'
  then
    raise exception 'Promotion event contradicts Opportunity state'
      using errcode = 'TS409';
  end if;

  select *
  into quote_row
  from public.project_quotes quote
  where quote.organization_id = new.organization_id
    and quote.id = new.accepted_quote_id;

  if not found
    or quote_row.originating_opportunity_id is distinct from new.opportunity_id
    or quote_row.project_id is distinct from new.project_id
    or quote_row.status <> 'Accepted'
  then
    raise exception 'Promotion event contradicts accepted quote state'
      using errcode = 'TS409';
  end if;

  select *
  into mapping_row
  from public.opportunity_final_projects final_project
  where final_project.organization_id = new.organization_id
    and final_project.opportunity_id = new.opportunity_id;

  if not found
    or mapping_row.project_id <> new.project_id
    or mapping_row.accepted_quote_id is distinct from new.accepted_quote_id
  then
    raise exception 'Promotion event contradicts final Project mapping'
      using errcode = 'TS409';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_opportunity_promotion_event_insert()
from public, anon, authenticated;

create trigger validate_opportunity_promotion_event_before_insert
before insert on public.opportunity_promotion_events
for each row execute function public.validate_opportunity_promotion_event_insert();

create trigger prevent_opportunity_promotion_event_update
before update on public.opportunity_promotion_events
for each row execute function public.prevent_opportunity_lifecycle_mutation();

create trigger prevent_opportunity_promotion_event_delete
before delete on public.opportunity_promotion_events
for each row execute function public.prevent_opportunity_lifecycle_mutation();

create or replace function public.create_opportunity_workspace_v1(
  p_organization_id uuid,
  p_creation_request_id uuid,
  p_strategy text,
  p_name text,
  p_client_id uuid default null,
  p_new_client jsonb default null,
  p_owner_user_id uuid default null,
  p_location text default 'Unspecified',
  p_due_date date default null,
  p_estimated_value numeric default 0,
  p_notes text default ''
)
returns table (
  opportunity_id uuid,
  opportunity_slug text,
  workspace_project_id uuid,
  workspace_project_slug text,
  lifecycle_id uuid,
  records_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  rollout_row public.opportunity_lifecycle_rollout_controls%rowtype;
  lifecycle_row public.opportunity_lifecycles%rowtype;
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  resolved_client_id uuid;
  resolved_owner_user_id uuid;
  opportunity_base_slug text;
  opportunity_candidate_slug text;
  workspace_base_slug text;
  workspace_candidate_slug text;
  slug_suffix integer;
  new_client_name text;
  new_client_company_name text;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not public.has_org_permission(
    p_organization_id,
    'leads.opportunities.write'
  ) then
    raise exception 'Not authorized for this organization'
      using errcode = '42501';
  end if;

  if p_creation_request_id is null then
    raise exception 'Creation request ID is required'
      using errcode = 'TS422';
  end if;

  if p_strategy not in (
    'legacy_two_project_v1',
    'promote_workspace_v1'
  ) then
    raise exception 'Unsupported Opportunity lifecycle strategy'
      using errcode = 'TS422';
  end if;

  select *
  into rollout_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id;

  if not found
    or rollout_row.creation_enabled is not true
    or rollout_row.allowed_strategy <> p_strategy
  then
    raise exception 'Opportunity lifecycle creation is not enabled'
      using errcode = 'TS409';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text
      || ':opportunity-creation-request:'
      || p_creation_request_id::text,
      0
    )
  );

  select *
  into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = p_organization_id
    and lifecycle.creation_request_id = p_creation_request_id;

  if found then
    if lifecycle_row.strategy <> p_strategy then
      raise exception 'Creation request is already bound to another strategy'
        using errcode = 'TS409';
    end if;

    select *
    into opportunity_row
    from public.organization_opportunities opportunity
    where opportunity.id = lifecycle_row.opportunity_id
      and opportunity.organization_id = p_organization_id;

    select *
    into workspace_row
    from public.organization_projects project
    where project.id = lifecycle_row.original_workspace_project_id
      and project.organization_id = p_organization_id;

    if opportunity_row.id is null
      or workspace_row.id is null
      or opportunity_row.workspace_project_id is distinct from workspace_row.id
      or workspace_row.source_opportunity_id is distinct from opportunity_row.id
    then
      raise exception 'Creation request lifecycle is inconsistent'
        using errcode = 'TS409';
    end if;

    return query
    select
      opportunity_row.id,
      opportunity_row.slug,
      workspace_row.id,
      workspace_row.slug,
      lifecycle_row.id,
      false;
    return;
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Opportunity name is required'
      using errcode = 'TS422';
  end if;

  if p_client_id is not null and p_new_client is not null then
    raise exception 'Choose either an existing client or a new client'
      using errcode = 'TS422';
  end if;

  if p_client_id is null and p_new_client is null then
    raise exception 'A client is required'
      using errcode = 'TS422';
  end if;

  if p_client_id is not null then
    select client.id
    into resolved_client_id
    from public.organization_clients client
    where client.id = p_client_id
      and client.organization_id = p_organization_id;

    if resolved_client_id is null then
      raise exception 'Client not found for organization'
        using errcode = 'TS422';
    end if;
  else
    if jsonb_typeof(p_new_client) <> 'object' then
      raise exception 'New client must be a JSON object'
        using errcode = 'TS422';
    end if;

    new_client_name := nullif(btrim(p_new_client ->> 'name'), '');
    new_client_company_name :=
      nullif(btrim(p_new_client ->> 'company_name'), '');

    if new_client_name is null or new_client_company_name is null then
      raise exception 'New client name and company name are required'
        using errcode = 'TS422';
    end if;

    insert into public.organization_clients (
      organization_id,
      created_by,
      name,
      company_name,
      email,
      phone
    )
    values (
      p_organization_id,
      actor_user_id,
      new_client_name,
      new_client_company_name,
      nullif(btrim(p_new_client ->> 'email'), ''),
      nullif(btrim(p_new_client ->> 'phone'), '')
    )
    returning id into resolved_client_id;
  end if;

  resolved_owner_user_id := coalesce(p_owner_user_id, actor_user_id);
  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = resolved_owner_user_id
  ) then
    raise exception 'Opportunity owner is not a member of the organization'
      using errcode = 'TS422';
  end if;

  opportunity_base_slug := regexp_replace(
    regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  );
  opportunity_base_slug :=
    coalesce(nullif(opportunity_base_slug, ''), 'opportunity');

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':opportunity-workspace-slugs',
      0
    )
  );

  opportunity_candidate_slug := opportunity_base_slug;
  slug_suffix := 2;
  while exists (
    select 1
    from public.organization_opportunities opportunity
    where opportunity.organization_id = p_organization_id
      and lower(opportunity.slug) = lower(opportunity_candidate_slug)
  ) loop
    opportunity_candidate_slug :=
      opportunity_base_slug || '-' || slug_suffix::text;
    slug_suffix := slug_suffix + 1;
  end loop;

  workspace_base_slug := opportunity_candidate_slug || '-tender';
  workspace_candidate_slug := workspace_base_slug;
  slug_suffix := 2;
  while exists (
    select 1
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and lower(project.slug) = lower(workspace_candidate_slug)
  ) loop
    workspace_candidate_slug :=
      workspace_base_slug || '-' || slug_suffix::text;
    slug_suffix := slug_suffix + 1;
  end loop;

  insert into public.organization_opportunities (
    organization_id,
    created_by,
    owner_user_id,
    client_id,
    name,
    slug,
    stage,
    location,
    due_date,
    estimated_value,
    notes
  )
  values (
    p_organization_id,
    actor_user_id,
    resolved_owner_user_id,
    resolved_client_id,
    btrim(p_name),
    opportunity_candidate_slug,
    'New',
    coalesce(nullif(btrim(p_location), ''), 'Unspecified'),
    p_due_date,
    coalesce(p_estimated_value, 0),
    coalesce(p_notes, '')
  )
  returning * into opportunity_row;

  insert into public.organization_projects (
    organization_id,
    created_by,
    client_id,
    name,
    slug,
    stage,
    location,
    cover_image_url,
    source_opportunity_id
  )
  values (
    p_organization_id,
    actor_user_id,
    resolved_client_id,
    btrim(p_name) || ' Tender Workspace',
    workspace_candidate_slug,
    'Pricing',
    coalesce(nullif(btrim(p_location), ''), 'Unspecified'),
    null,
    opportunity_row.id
  )
  returning * into workspace_row;

  update public.organization_opportunities opportunity
  set workspace_project_id = workspace_row.id
  where opportunity.id = opportunity_row.id
    and opportunity.organization_id = p_organization_id;

  insert into public.opportunity_lifecycles (
    organization_id,
    opportunity_id,
    original_workspace_project_id,
    strategy,
    strategy_version,
    creation_request_id,
    created_by,
    metadata
  )
  values (
    p_organization_id,
    opportunity_row.id,
    workspace_row.id,
    p_strategy,
    1,
    p_creation_request_id,
    actor_user_id,
    jsonb_build_object('creation_function', 'create_opportunity_workspace_v1')
  )
  returning * into lifecycle_row;

  return query
  select
    opportunity_row.id,
    opportunity_row.slug,
    workspace_row.id,
    workspace_row.slug,
    lifecycle_row.id,
    true;
end;
$$;

revoke all on function public.create_opportunity_workspace_v1(
  uuid, uuid, text, text, uuid, jsonb, uuid, text, date, numeric, text
) from public, anon;
grant execute on function public.create_opportunity_workspace_v1(
  uuid, uuid, text, text, uuid, jsonb, uuid, text, date, numeric, text
) to authenticated;

create or replace function public.promote_opportunity_workspace_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id uuid
)
returns table (
  project_id uuid,
  project_slug text,
  accepted_quote_id uuid,
  promotion_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  rollout_row public.opportunity_lifecycle_rollout_controls%rowtype;
  lifecycle_row public.opportunity_lifecycles%rowtype;
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  accepted_quote_row public.project_quotes%rowtype;
  event_row public.opportunity_promotion_events%rowtype;
  final_mapping_row public.opportunity_final_projects%rowtype;
  accepted_quote_count integer;
  orphan_candidate_count integer;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization'
      using errcode = '42501';
  end if;

  if p_correlation_id is null then
    raise exception 'Promotion correlation ID is required'
      using errcode = 'TS422';
  end if;

  select *
  into rollout_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id;

  if not found
    or rollout_row.promotion_enabled is not true
    or rollout_row.allowed_strategy <> 'promote_workspace_v1'
  then
    raise exception 'Opportunity promotion is not enabled'
      using errcode = 'TS409';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
    and opportunity.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Opportunity not found for organization'
      using errcode = 'TS422';
  end if;

  select *
  into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = p_organization_id
    and lifecycle.opportunity_id = p_opportunity_id
  for key share;

  if not found then
    raise exception 'Opportunity has no lifecycle strategy'
      using errcode = 'TS409';
  end if;

  if lifecycle_row.strategy <> 'promote_workspace_v1'
    or lifecycle_row.strategy_version <> 1
  then
    raise exception 'Opportunity lifecycle strategy does not permit promotion'
      using errcode = 'TS409';
  end if;

  if opportunity_row.workspace_project_id is null
    or lifecycle_row.original_workspace_project_id
      is distinct from opportunity_row.workspace_project_id
  then
    raise exception 'Opportunity workspace lifecycle is inconsistent'
      using errcode = 'TS409';
  end if;

  select *
  into workspace_row
  from public.organization_projects project
  where project.id = opportunity_row.workspace_project_id
    and project.organization_id = p_organization_id
  for update;

  if not found
    or workspace_row.source_opportunity_id is distinct from opportunity_row.id
  then
    raise exception 'Tender workspace does not belong to the Opportunity'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.organization_opportunities other_opportunity
    where other_opportunity.workspace_project_id = workspace_row.id
      and other_opportunity.id <> opportunity_row.id
  ) then
    raise exception 'Tender workspace is shared by multiple Opportunities'
      using errcode = 'TS409';
  end if;

  select count(*)::integer
  into orphan_candidate_count
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.source_opportunity_id = opportunity_row.id
    and project.id <> workspace_row.id;

  if orphan_candidate_count > 0 then
    raise exception
      'Opportunity has unclassified delivery Project candidates'
      using errcode = 'TS409',
            detail = orphan_candidate_count::text;
  end if;

  select count(*)::integer
  into accepted_quote_count
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.status = 'Accepted';

  if accepted_quote_count <> 1 then
    raise exception 'Opportunity must have exactly one Accepted canonical quote'
      using errcode = 'TS409',
            detail = accepted_quote_count::text;
  end if;

  select *
  into accepted_quote_row
  from public.project_quotes quote
  where quote.id = p_accepted_quote_id
    and quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.status = 'Accepted'
  for update;

  if not found then
    raise exception 'Accepted quote does not belong to this Opportunity'
      using errcode = 'TS422';
  end if;

  if accepted_quote_row.project_id is not null
    and accepted_quote_row.project_id <> workspace_row.id
  then
    raise exception 'Accepted quote is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and quote.project_id is not null
      and quote.project_id <> workspace_row.id
  ) then
    raise exception 'Quote history is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.project_quote_line_items line
    join public.project_quotes quote
      on quote.id = line.quote_id
     and quote.organization_id = line.organization_id
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and line.project_id is not null
      and line.project_id <> workspace_row.id
  ) then
    raise exception 'Quote line history is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.commercial_items item
    where item.organization_id = p_organization_id
      and item.opportunity_id = p_opportunity_id
      and item.project_id is not null
      and item.project_id <> workspace_row.id
  ) then
    raise exception 'Commercial items are attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.cost_items cost_item
    join public.project_quotes quote
      on quote.id = cost_item.source_document_id
     and cost_item.source_document_kind = 'project_quote'
     and quote.organization_id = cost_item.organization_id
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and cost_item.project_id <> workspace_row.id
  ) then
    raise exception 'Commercial CostItems are attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  if opportunity_row.converted_project_id is not null
    and opportunity_row.converted_project_id <> workspace_row.id
  then
    raise exception 'Opportunity already points to a different final Project'
      using errcode = 'TS409';
  end if;

  select *
  into final_mapping_row
  from public.opportunity_final_projects final_project
  where final_project.opportunity_id = p_opportunity_id
  for update;

  if found and (
    final_mapping_row.organization_id <> p_organization_id
    or final_mapping_row.project_id <> workspace_row.id
    or final_mapping_row.accepted_quote_id is distinct from accepted_quote_row.id
  ) then
    raise exception 'Opportunity has a conflicting final Project mapping'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.opportunity_promotion_events promotion_event
    where promotion_event.organization_id = p_organization_id
      and promotion_event.correlation_id = p_correlation_id
      and promotion_event.opportunity_id <> p_opportunity_id
  ) then
    raise exception 'Promotion correlation ID is already in use'
      using errcode = 'TS409';
  end if;

  select *
  into event_row
  from public.opportunity_promotion_events promotion_event
  where promotion_event.organization_id = p_organization_id
    and promotion_event.opportunity_id = p_opportunity_id;

  if found then
    if event_row.lifecycle_id <> lifecycle_row.id
      or event_row.project_id <> workspace_row.id
      or event_row.accepted_quote_id <> accepted_quote_row.id
      or opportunity_row.converted_project_id is distinct from workspace_row.id
      or final_mapping_row.project_id is distinct from workspace_row.id
    then
      raise exception 'Completed promotion evidence is inconsistent'
        using errcode = 'TS409';
    end if;

    return query
    select workspace_row.id, workspace_row.slug, accepted_quote_row.id, false;
    return;
  end if;

  if final_mapping_row.opportunity_id is null then
    insert into public.opportunity_final_projects (
      opportunity_id,
      organization_id,
      project_id,
      accepted_quote_id,
      created_by
    )
    values (
      opportunity_row.id,
      p_organization_id,
      workspace_row.id,
      accepted_quote_row.id,
      actor_user_id
    )
    returning * into final_mapping_row;
  end if;

  perform *
  from public.attach_opportunity_commercial_history_to_project(
    p_organization_id,
    opportunity_row.id,
    workspace_row.id
  );

  update public.organization_opportunities opportunity
  set converted_project_id = workspace_row.id,
      converted_at = timezone('utc', now()),
      stage = 'Won',
      quoted_at = coalesce(
        opportunity.quoted_at,
        accepted_quote_row.quote_date,
        timezone('utc', now())::date
      )
  where opportunity.id = opportunity_row.id
    and opportunity.organization_id = p_organization_id;

  insert into public.opportunity_promotion_events (
    organization_id,
    lifecycle_id,
    opportunity_id,
    project_id,
    accepted_quote_id,
    strategy,
    strategy_version,
    correlation_id,
    completed_by
  )
  values (
    p_organization_id,
    lifecycle_row.id,
    opportunity_row.id,
    workspace_row.id,
    accepted_quote_row.id,
    lifecycle_row.strategy,
    lifecycle_row.strategy_version,
    p_correlation_id,
    actor_user_id
  );

  return query
  select workspace_row.id, workspace_row.slug, accepted_quote_row.id, true;
end;
$$;

revoke all on function public.promote_opportunity_workspace_v1(
  uuid, uuid, uuid, uuid
) from public, anon;
grant execute on function public.promote_opportunity_workspace_v1(
  uuid, uuid, uuid, uuid
) to authenticated;

-- Preserve the current legacy implementation byte-for-byte except for one
-- fail-closed strategy guard after the Opportunity row is locked.
create or replace function public.convert_accepted_opportunity_to_project(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid
)
returns table (
  project_id uuid,
  project_slug text,
  project_created boolean,
  storage_clone_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  accepted_quote_row public.project_quotes%rowtype;
  final_project_row public.organization_projects%rowtype;
  existing_final_project_id uuid;
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 2;
  orphan_candidate_count integer;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization'
      using errcode = '42501';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
    and opportunity.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Opportunity not found for organization'
      using errcode = 'TS422';
  end if;

  if exists (
    select 1
    from public.opportunity_lifecycles lifecycle
    where lifecycle.organization_id = p_organization_id
      and lifecycle.opportunity_id = p_opportunity_id
      and lifecycle.strategy = 'promote_workspace_v1'
  ) then
    raise exception
      'Promotion-strategy Opportunities cannot use legacy conversion'
      using errcode = 'TS409';
  end if;

  select final_project.project_id
  into existing_final_project_id
  from public.opportunity_final_projects final_project
  where final_project.organization_id = p_organization_id
    and final_project.opportunity_id = p_opportunity_id;

  if existing_final_project_id is not null then
    select *
    into final_project_row
    from public.organization_projects project
    where project.id = existing_final_project_id
      and project.organization_id = p_organization_id;

    if not found then
      raise exception 'Designated final Project is missing'
        using errcode = 'TS409';
    end if;

    return query
    select final_project_row.id, final_project_row.slug, false, true;
    return;
  end if;

  select *
  into accepted_quote_row
  from public.project_quotes quote
  where quote.id = p_accepted_quote_id
    and quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Accepted quote does not belong to this Opportunity'
      using errcode = 'TS422';
  end if;

  if accepted_quote_row.status <> 'Accepted' then
    raise exception 'Quote must be Accepted before conversion'
      using errcode = 'TS422';
  end if;

  if exists (
    select 1
    from public.project_quotes newer_quote
    where newer_quote.organization_id = p_organization_id
      and newer_quote.originating_opportunity_id = p_opportunity_id
      and newer_quote.status = 'Accepted'
      and (
        newer_quote.updated_at > accepted_quote_row.updated_at
        or (
          newer_quote.updated_at = accepted_quote_row.updated_at
          and newer_quote.id > accepted_quote_row.id
        )
      )
  ) then
    raise exception
      'Accepted quote has been superseded by a newer Accepted quote'
      using errcode = 'TS409';
  end if;

  if opportunity_row.workspace_project_id is null then
    raise exception 'Opportunity has no recorded tender workspace'
      using errcode = 'TS422';
  end if;

  select *
  into workspace_row
  from public.organization_projects project
  where project.id = opportunity_row.workspace_project_id
    and project.organization_id = p_organization_id
  for key share;

  if not found
    or workspace_row.source_opportunity_id is distinct from opportunity_row.id
  then
    raise exception 'Tender workspace does not belong to the Opportunity'
      using errcode = 'TS409';
  end if;

  if accepted_quote_row.project_id is not null
    and accepted_quote_row.project_id <> workspace_row.id
  then
    raise exception 'Accepted quote is attached to an unrelated Project'
      using errcode = 'TS409';
  end if;

  select count(*)
  into orphan_candidate_count
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.source_opportunity_id = opportunity_row.id
    and project.id <> workspace_row.id;

  if orphan_candidate_count > 0 then
    raise exception
      'Opportunity has unclassified delivery Project candidates; administrative reconciliation is required'
      using errcode = 'TS409',
            detail = orphan_candidate_count::text;
  end if;

  base_slug := regexp_replace(
    regexp_replace(lower(btrim(opportunity_row.name)), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  );
  base_slug := coalesce(nullif(base_slug, ''), 'project');

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':project-slug:' || base_slug,
      0
    )
  );

  candidate_slug := base_slug;
  while exists (
    select 1
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and lower(project.slug) = lower(candidate_slug)
  ) loop
    candidate_slug := base_slug || '-' || slug_suffix::text;
    slug_suffix := slug_suffix + 1;
  end loop;

  insert into public.organization_projects (
    organization_id,
    created_by,
    client_id,
    name,
    slug,
    stage,
    location,
    cover_image_url,
    source_opportunity_id
  )
  values (
    p_organization_id,
    actor_user_id,
    opportunity_row.client_id,
    opportunity_row.name,
    candidate_slug,
    'Pricing',
    coalesce(nullif(btrim(opportunity_row.location), ''), 'Unspecified'),
    null,
    opportunity_row.id
  )
  returning * into final_project_row;

  insert into public.opportunity_final_projects (
    opportunity_id,
    organization_id,
    project_id,
    accepted_quote_id,
    created_by
  )
  values (
    opportunity_row.id,
    p_organization_id,
    final_project_row.id,
    accepted_quote_row.id,
    actor_user_id
  );

  perform *
  from public.attach_opportunity_commercial_history_to_project(
    p_organization_id,
    opportunity_row.id,
    final_project_row.id
  );

  perform public.sync_opportunity_legacy_quote_on_conversion(
    p_organization_id,
    opportunity_row.id,
    final_project_row.id,
    actor_user_id
  );

  perform public.ensure_opportunity_project_document_workspace(
    opportunity_row.id,
    final_project_row.id
  );

  update public.organization_opportunities opportunity
  set converted_project_id = final_project_row.id,
      converted_at = timezone('utc', now()),
      stage = 'Won',
      quoted_at = coalesce(
        opportunity.quoted_at,
        accepted_quote_row.quote_date,
        timezone('utc', now())::date
      )
  where opportunity.id = opportunity_row.id
    and opportunity.organization_id = p_organization_id;

  return query
  select final_project_row.id, final_project_row.slug, true, true;
end;
$$;

revoke all on function public.convert_accepted_opportunity_to_project(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.convert_accepted_opportunity_to_project(
  uuid, uuid, uuid
) to authenticated;

create or replace view public.opportunity_lifecycle_reconciliation_v1
with (security_invoker = true)
as
select
  opportunity.organization_id,
  opportunity.id as opportunity_id,
  opportunity.workspace_project_id,
  opportunity.converted_project_id,
  lifecycle.id as lifecycle_id,
  lifecycle.strategy,
  lifecycle.strategy_version,
  final_project.project_id as mapped_project_id,
  final_project.accepted_quote_id as mapped_accepted_quote_id,
  case
    when lifecycle.id is not null
      and lifecycle.strategy = 'promote_workspace_v1'
      and opportunity.workspace_project_id = opportunity.converted_project_id
      and final_project.project_id = opportunity.workspace_project_id
      and promotion_event.id is not null
      then 'completed_promoted_opportunity'
    when lifecycle.id is not null
      and lifecycle.strategy = 'promote_workspace_v1'
      then 'marked_for_workspace_promotion'
    when lifecycle.id is not null
      and lifecycle.strategy = 'legacy_two_project_v1'
      then 'marked_for_legacy_conversion'
    when opportunity.workspace_project_id is not null
      and opportunity.converted_project_id is not null
      and opportunity.workspace_project_id <> opportunity.converted_project_id
      and final_project.project_id = opportunity.converted_project_id
      then 'historical_two_project'
    when lifecycle.id is null
      then 'unmarked_pre_cutover'
    else 'unclassified'
  end as record_shape,
  (
    lifecycle.id is not null
    and lifecycle.original_workspace_project_id
      is distinct from opportunity.workspace_project_id
  ) as lifecycle_workspace_contradiction,
  (
    lifecycle.id is not null
    and (
      workspace.id is null
      or workspace.organization_id <> opportunity.organization_id
      or workspace.source_opportunity_id is distinct from opportunity.id
    )
  ) as workspace_lineage_contradiction,
  (
    final_project.project_id is not null
    and final_project.project_id is distinct from opportunity.converted_project_id
  ) as final_mapping_contradiction,
  (
    select count(*)::integer
    from public.project_quotes accepted_quote
    where accepted_quote.organization_id = opportunity.organization_id
      and accepted_quote.originating_opportunity_id = opportunity.id
      and accepted_quote.status = 'Accepted'
  ) as accepted_quote_count,
  (
    select count(*)::integer
    from public.organization_projects candidate
    where candidate.organization_id = opportunity.organization_id
      and candidate.source_opportunity_id = opportunity.id
      and candidate.id <> opportunity.workspace_project_id
      and candidate.id is distinct from opportunity.converted_project_id
  ) as orphan_final_candidate_count,
  exists (
    select 1
    from public.organization_opportunities other_opportunity
    where other_opportunity.workspace_project_id = opportunity.workspace_project_id
      and other_opportunity.id <> opportunity.id
  ) as workspace_is_shared,
  exists (
    select 1
    from public.project_quotes quote
    where quote.organization_id = opportunity.organization_id
      and quote.originating_opportunity_id = opportunity.id
      and quote.project_id is not null
      and quote.project_id not in (
        opportunity.workspace_project_id,
        opportunity.converted_project_id
      )
  ) as has_unrelated_quote_ownership,
  exists (
    select 1
    from public.commercial_items item
    where item.organization_id = opportunity.organization_id
      and item.opportunity_id = opportunity.id
      and item.project_id is not null
      and item.project_id not in (
        opportunity.workspace_project_id,
        opportunity.converted_project_id
      )
  ) as has_unrelated_commercial_ownership,
  exists (
    select 1
    from public.cost_items cost_item
    join public.project_quotes quote
      on quote.id = cost_item.source_document_id
     and cost_item.source_document_kind = 'project_quote'
     and quote.organization_id = cost_item.organization_id
    where quote.organization_id = opportunity.organization_id
      and quote.originating_opportunity_id = opportunity.id
      and cost_item.project_id not in (
        opportunity.workspace_project_id,
        opportunity.converted_project_id
      )
  ) as has_unrelated_cost_ownership
from public.organization_opportunities opportunity
left join public.opportunity_lifecycles lifecycle
  on lifecycle.organization_id = opportunity.organization_id
 and lifecycle.opportunity_id = opportunity.id
left join public.organization_projects workspace
  on workspace.id = opportunity.workspace_project_id
left join public.opportunity_final_projects final_project
  on final_project.organization_id = opportunity.organization_id
 and final_project.opportunity_id = opportunity.id
left join public.opportunity_promotion_events promotion_event
  on promotion_event.organization_id = opportunity.organization_id
 and promotion_event.opportunity_id = opportunity.id;

create or replace view public.project_lifecycle_reconciliation_v1
with (security_invoker = true)
as
select
  project.organization_id,
  project.id as project_id,
  project.source_opportunity_id,
  case
    when project.source_opportunity_id is null then 'direct_project'
    when final_project.project_id = project.id
      and lifecycle.strategy = 'promote_workspace_v1'
      and opportunity.workspace_project_id = project.id
      then 'promoted_project'
    when final_project.project_id = project.id
      then 'historical_final_project'
    when opportunity.workspace_project_id = project.id
      then 'tender_workspace'
    when project.source_opportunity_id is not null
      then 'orphan_final_candidate'
    else 'unclassified'
  end as project_shape,
  lifecycle.strategy,
  lifecycle.strategy_version
from public.organization_projects project
left join public.organization_opportunities opportunity
  on opportunity.organization_id = project.organization_id
 and opportunity.id = project.source_opportunity_id
left join public.opportunity_lifecycles lifecycle
  on lifecycle.organization_id = project.organization_id
 and lifecycle.opportunity_id = opportunity.id
left join public.opportunity_final_projects final_project
  on final_project.organization_id = project.organization_id
 and final_project.opportunity_id = opportunity.id;

revoke all on public.opportunity_lifecycle_reconciliation_v1
from public, anon;
grant select on public.opportunity_lifecycle_reconciliation_v1
to authenticated;

revoke all on public.project_lifecycle_reconciliation_v1
from public, anon;
grant select on public.project_lifecycle_reconciliation_v1
to authenticated;

comment on table public.opportunity_lifecycles is
  'Immutable per-Opportunity lifecycle strategy and successful creation-request identity. Stage 1 performs no backfill.';

comment on table public.opportunity_promotion_events is
  'Immutable evidence for completed same-Project Opportunity promotion.';

comment on function public.create_opportunity_workspace_v1(
  uuid, uuid, text, text, uuid, jsonb, uuid, text, date, numeric, text
) is
  'Dormant atomic and idempotent Opportunity plus permanent workspace creation. Requires an explicit rollout-control row.';

comment on function public.promote_opportunity_workspace_v1(
  uuid, uuid, uuid, uuid
) is
  'Dormant atomic and idempotent same-Project promotion. Never inserts an organization_projects row and requires an explicit rollout-control row.';

commit;
