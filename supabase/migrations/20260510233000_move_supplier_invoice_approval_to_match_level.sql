begin;

alter table if exists public.supplier_invoice_purchase_order_matches
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by_user_id uuid null references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approval_notes text not null default '',
  add column if not exists approval_checks_json jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_invoice_po_matches_approval_status_check'
  ) then
    alter table public.supplier_invoice_purchase_order_matches
      add constraint supplier_invoice_po_matches_approval_status_check
      check (approval_status in ('pending', 'approved', 'disputed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_invoice_po_matches_approval_checks_object_check'
  ) then
    alter table public.supplier_invoice_purchase_order_matches
      add constraint supplier_invoice_po_matches_approval_checks_object_check
      check (jsonb_typeof(approval_checks_json) = 'object');
  end if;
end $$;

create index if not exists supplier_invoice_po_matches_invoice_approval_idx
  on public.supplier_invoice_purchase_order_matches (supplier_invoice_id, approval_status, created_at desc);

create index if not exists supplier_invoice_po_matches_purchase_order_approval_idx
  on public.supplier_invoice_purchase_order_matches (purchase_order_id, approval_status, created_at desc);

create table if not exists public.supplier_invoice_match_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_purchase_order_match_id uuid not null references public.supplier_invoice_purchase_order_matches (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete cascade,
  approver_user_id uuid null references auth.users (id) on delete set null,
  approver_role text null,
  status text not null,
  decision_notes text not null default '',
  checks_json jsonb not null default '{}'::jsonb,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_match_approval_steps_status_check
    check (status in ('approved', 'disputed')),
  constraint supplier_invoice_match_approval_steps_role_not_blank
    check (approver_role is null or char_length(trim(approver_role)) > 0),
  constraint supplier_invoice_match_approval_steps_checks_object
    check (jsonb_typeof(checks_json) = 'object')
);

create index if not exists supplier_invoice_match_approval_steps_match_created_idx
  on public.supplier_invoice_match_approval_steps (supplier_invoice_purchase_order_match_id, created_at desc);

create index if not exists supplier_invoice_match_approval_steps_invoice_created_idx
  on public.supplier_invoice_match_approval_steps (supplier_invoice_id, created_at desc);

drop trigger if exists set_supplier_invoice_match_approval_steps_updated_at
  on public.supplier_invoice_match_approval_steps;
create trigger set_supplier_invoice_match_approval_steps_updated_at
before update on public.supplier_invoice_match_approval_steps
for each row execute function public.set_updated_at();

alter table public.supplier_invoice_match_approval_steps enable row level security;
alter table public.supplier_invoice_match_approval_steps force row level security;

drop policy if exists "Privileged members can view supplier invoice match approval steps"
  on public.supplier_invoice_match_approval_steps;
create policy "Privileged members can view supplier invoice match approval steps"
on public.supplier_invoice_match_approval_steps
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_match_approval_steps.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged reviewers can create supplier invoice match approval steps"
  on public.supplier_invoice_match_approval_steps;
create policy "Privileged reviewers can create supplier invoice match approval steps"
on public.supplier_invoice_match_approval_steps
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_match_approval_steps.organization_id, 'supplier_invoices.review')
);

drop policy if exists "Privileged reviewers can update supplier invoice match approval steps"
  on public.supplier_invoice_match_approval_steps;
create policy "Privileged reviewers can update supplier invoice match approval steps"
on public.supplier_invoice_match_approval_steps
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_match_approval_steps.organization_id, 'supplier_invoices.review')
)
with check (
  public.has_org_permission(supplier_invoice_match_approval_steps.organization_id, 'supplier_invoices.review')
);

drop policy if exists "Privileged reviewers can delete supplier invoice match approval steps"
  on public.supplier_invoice_match_approval_steps;
create policy "Privileged reviewers can delete supplier invoice match approval steps"
on public.supplier_invoice_match_approval_steps
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_match_approval_steps.organization_id, 'supplier_invoices.review')
);

grant select, insert, update, delete on public.supplier_invoice_match_approval_steps to authenticated;

create or replace function public.prepare_supplier_invoice_match_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.approval_status := coalesce(new.approval_status, 'pending');
  new.approval_notes := coalesce(new.approval_notes, '');
  new.approval_checks_json := coalesce(new.approval_checks_json, '{}'::jsonb);

  if new.approval_status in ('approved', 'disputed')
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to review supplier invoice allocations.';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.matched_amount is distinct from old.matched_amount
      or new.match_status is distinct from old.match_status
      or new.purchase_order_id is distinct from old.purchase_order_id
    )
    and new.approval_status = old.approval_status
    and old.approval_status in ('approved', 'disputed') then
    new.approval_status := 'pending';
    new.approved_by_user_id := null;
    new.approved_at := null;
    new.approval_notes := '';
    new.approval_checks_json := '{}'::jsonb;
  end if;

  if new.approval_status = 'pending' then
    new.approved_by_user_id := null;
    new.approved_at := null;
  elsif new.approved_at is null then
    new.approved_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_supplier_invoice_match_review_transition
  on public.supplier_invoice_purchase_order_matches;
create trigger prepare_supplier_invoice_match_review_transition
before insert or update on public.supplier_invoice_purchase_order_matches
for each row execute function public.prepare_supplier_invoice_match_review_transition();

create or replace function public.rollup_supplier_invoice_status_from_matches(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_match_count integer := 0;
  disputed_match_count integer := 0;
  approved_match_count integer := 0;
  current_status text;
  next_status text;
  can_review boolean := false;
begin
  select si.status
  into current_status
  from public.supplier_invoices si
  where si.id = p_supplier_invoice_id
    and si.organization_id = p_organization_id;

  if current_status is null then
    return;
  end if;

  select
    count(*) filter (where match_status in ('accepted', 'adjusted')),
    count(*) filter (
      where match_status in ('accepted', 'adjusted')
        and approval_status = 'disputed'
    ),
    count(*) filter (
      where match_status in ('accepted', 'adjusted')
        and approval_status = 'approved'
    )
  into active_match_count, disputed_match_count, approved_match_count
  from public.supplier_invoice_purchase_order_matches
  where supplier_invoice_id = p_supplier_invoice_id
    and organization_id = p_organization_id;

  can_review := public.has_org_permission(p_organization_id, 'supplier_invoices.review');

  if active_match_count = 0 then
    if current_status in ('Approved', 'Disputed') then
      next_status := 'Needs Review';
    else
      next_status := current_status;
    end if;
  elsif disputed_match_count > 0 then
    next_status := 'Disputed';
  elsif approved_match_count = active_match_count then
    next_status := 'Approved';
  else
    next_status := 'Needs Review';
  end if;

  if next_status in ('Approved', 'Disputed') and not can_review then
    next_status := 'Needs Review';
  end if;

  if next_status is distinct from current_status then
    update public.supplier_invoices
    set status = next_status
    where id = p_supplier_invoice_id
      and organization_id = p_organization_id;
  end if;
end;
$$;

create or replace function public.handle_supplier_invoice_match_activity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  purchase_order_number_value text;
  event_type text;
  event_message text;
  event_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    select ppo.purchase_order_number
    into purchase_order_number_value
    from public.project_purchase_orders as ppo
    where ppo.id = old.purchase_order_id;

    event_type := 'match_removed';
    event_message := format(
      'Purchase order %s removed from the invoice match list.',
      coalesce(purchase_order_number_value, old.purchase_order_id::text)
    );
    event_metadata := jsonb_build_object(
      'purchase_order_id', old.purchase_order_id,
      'matched_amount', old.matched_amount,
      'match_status', old.match_status
    );

    perform public.record_supplier_invoice_activity_event(
      old.organization_id,
      old.supplier_invoice_id,
      event_type,
      event_message,
      event_metadata,
      auth.uid()
    );

    perform public.rollup_supplier_invoice_status_from_matches(
      old.organization_id,
      old.supplier_invoice_id
    );

    return old;
  end if;

  select ppo.purchase_order_number
  into purchase_order_number_value
  from public.project_purchase_orders as ppo
  where ppo.id = new.purchase_order_id;

  if tg_op = 'INSERT' then
    event_type := 'match_added';
    event_message := format(
      'Purchase order %s matched to the invoice.',
      coalesce(purchase_order_number_value, new.purchase_order_id::text)
    );
    event_metadata := jsonb_build_object(
      'purchase_order_id', new.purchase_order_id,
      'matched_amount', new.matched_amount,
      'match_status', new.match_status
    );
  else
    if new.matched_amount is not distinct from old.matched_amount
      and new.match_status is not distinct from old.match_status
      and new.purchase_order_id is not distinct from old.purchase_order_id
      and new.approval_status is not distinct from old.approval_status
      and new.approved_by_user_id is not distinct from old.approved_by_user_id
      and new.approved_at is not distinct from old.approved_at
      and new.approval_notes is not distinct from old.approval_notes
      and new.approval_checks_json is not distinct from old.approval_checks_json then
      return new;
    end if;

    event_type := 'match_updated';
    event_message := format(
      'Purchase order %s match updated.',
      coalesce(purchase_order_number_value, new.purchase_order_id::text)
    );
    event_metadata := jsonb_build_object(
      'purchase_order_id', new.purchase_order_id,
      'matched_amount', new.matched_amount,
      'match_status', new.match_status,
      'previous_matched_amount', old.matched_amount,
      'previous_match_status', old.match_status
    );
  end if;

  perform public.record_supplier_invoice_activity_event(
    new.organization_id,
    new.supplier_invoice_id,
    event_type,
    event_message,
    event_metadata,
    auth.uid()
  );

  if tg_op = 'UPDATE'
    and new.approval_status is distinct from old.approval_status then
    if new.approval_status in ('approved', 'disputed') then
      insert into public.supplier_invoice_match_approval_steps (
        organization_id,
        supplier_invoice_purchase_order_match_id,
        supplier_invoice_id,
        purchase_order_id,
        approver_user_id,
        approver_role,
        status,
        decision_notes,
        checks_json,
        decided_at
      )
      values (
        new.organization_id,
        new.id,
        new.supplier_invoice_id,
        new.purchase_order_id,
        new.approved_by_user_id,
        (
          select om.role
          from public.organization_members om
          where om.organization_id = new.organization_id
            and om.user_id = new.approved_by_user_id
          order by om.created_at asc
          limit 1
        ),
        new.approval_status,
        new.approval_notes,
        new.approval_checks_json,
        new.approved_at
      );
    end if;

    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.supplier_invoice_id,
      case
        when new.approval_status = 'approved' then 'allocation_approved'
        when new.approval_status = 'disputed' then 'allocation_disputed'
        else 'allocation_approval_changed'
      end,
      case
        when new.approval_status = 'approved' then format(
          'Allocation for purchase order %s approved.',
          coalesce(purchase_order_number_value, new.purchase_order_id::text)
        )
        when new.approval_status = 'disputed' then format(
          'Allocation for purchase order %s disputed.',
          coalesce(purchase_order_number_value, new.purchase_order_id::text)
        )
        else format(
          'Allocation review for purchase order %s changed.',
          coalesce(purchase_order_number_value, new.purchase_order_id::text)
        )
      end,
      jsonb_build_object(
        'purchase_order_id', new.purchase_order_id,
        'approval_status', new.approval_status,
        'matched_amount', new.matched_amount
      ),
      auth.uid()
    );
  end if;

  perform public.rollup_supplier_invoice_status_from_matches(
    new.organization_id,
    new.supplier_invoice_id
  );

  return new;
end;
$$;

drop trigger if exists handle_supplier_invoice_match_activity_insert
  on public.supplier_invoice_purchase_order_matches;
create trigger handle_supplier_invoice_match_activity_insert
after insert on public.supplier_invoice_purchase_order_matches
for each row execute function public.handle_supplier_invoice_match_activity();

drop trigger if exists handle_supplier_invoice_match_activity_update
  on public.supplier_invoice_purchase_order_matches;
create trigger handle_supplier_invoice_match_activity_update
after update on public.supplier_invoice_purchase_order_matches
for each row execute function public.handle_supplier_invoice_match_activity();

drop trigger if exists handle_supplier_invoice_match_activity_delete
  on public.supplier_invoice_purchase_order_matches;
create trigger handle_supplier_invoice_match_activity_delete
after delete on public.supplier_invoice_purchase_order_matches
for each row execute function public.handle_supplier_invoice_match_activity();

commit;
