begin;

create table if not exists public.supplier_invoice_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  approver_user_id uuid null references auth.users (id) on delete set null,
  approver_role text null,
  status text not null default 'pending',
  decision_notes text not null default '',
  checks_json jsonb not null default '{}'::jsonb,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_approval_steps_status_check
    check (status in ('pending', 'approved', 'rejected', 'disputed')),
  constraint supplier_invoice_approval_steps_role_not_blank
    check (approver_role is null or char_length(trim(approver_role)) > 0),
  constraint supplier_invoice_approval_steps_checks_json_object
    check (jsonb_typeof(checks_json) = 'object')
);

create index if not exists supplier_invoice_approval_steps_invoice_created_idx
  on public.supplier_invoice_approval_steps (supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_approval_steps_invoice_decided_idx
  on public.supplier_invoice_approval_steps (supplier_invoice_id, decided_at desc)
  where decided_at is not null;

drop trigger if exists set_supplier_invoice_approval_steps_updated_at
  on public.supplier_invoice_approval_steps;
create trigger set_supplier_invoice_approval_steps_updated_at
before update on public.supplier_invoice_approval_steps
for each row execute function public.set_updated_at();

create table if not exists public.supplier_invoice_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_invoice_activity_events_type_not_blank
    check (char_length(trim(event_type)) > 0),
  constraint supplier_invoice_activity_events_message_not_blank
    check (char_length(trim(message)) > 0),
  constraint supplier_invoice_activity_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists supplier_invoice_activity_events_invoice_created_idx
  on public.supplier_invoice_activity_events (supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_activity_events_org_created_idx
  on public.supplier_invoice_activity_events (organization_id, created_at desc);

alter table public.supplier_invoice_approval_steps enable row level security;
alter table public.supplier_invoice_approval_steps force row level security;
alter table public.supplier_invoice_activity_events enable row level security;
alter table public.supplier_invoice_activity_events force row level security;

drop policy if exists "Privileged members can view supplier invoice approval steps"
  on public.supplier_invoice_approval_steps;
create policy "Privileged members can view supplier invoice approval steps"
on public.supplier_invoice_approval_steps
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_approval_steps.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged reviewers can create supplier invoice approval steps"
  on public.supplier_invoice_approval_steps;
create policy "Privileged reviewers can create supplier invoice approval steps"
on public.supplier_invoice_approval_steps
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_approval_steps.organization_id, 'supplier_invoices.review')
);

drop policy if exists "Privileged reviewers can update supplier invoice approval steps"
  on public.supplier_invoice_approval_steps;
create policy "Privileged reviewers can update supplier invoice approval steps"
on public.supplier_invoice_approval_steps
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_approval_steps.organization_id, 'supplier_invoices.review')
)
with check (
  public.has_org_permission(supplier_invoice_approval_steps.organization_id, 'supplier_invoices.review')
);

drop policy if exists "Privileged reviewers can delete supplier invoice approval steps"
  on public.supplier_invoice_approval_steps;
create policy "Privileged reviewers can delete supplier invoice approval steps"
on public.supplier_invoice_approval_steps
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_approval_steps.organization_id, 'supplier_invoices.review')
);

drop policy if exists "Privileged members can view supplier invoice activity events"
  on public.supplier_invoice_activity_events;
create policy "Privileged members can view supplier invoice activity events"
on public.supplier_invoice_activity_events
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_activity_events.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice activity events"
  on public.supplier_invoice_activity_events;
create policy "Privileged members can create supplier invoice activity events"
on public.supplier_invoice_activity_events
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_activity_events.organization_id, 'supplier_invoices.write')
  or public.has_org_permission(supplier_invoice_activity_events.organization_id, 'supplier_invoices.review')
);

grant select, insert, update, delete on public.supplier_invoice_approval_steps to authenticated;
grant select, insert on public.supplier_invoice_activity_events to authenticated;

create or replace function public.record_supplier_invoice_activity_event(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_event_type text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default auth.uid()
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.supplier_invoice_activity_events (
    organization_id,
    supplier_invoice_id,
    event_type,
    message,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    p_supplier_invoice_id,
    p_event_type,
    p_message,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by
  );
end;
$$;

create or replace function public.prepare_supplier_invoice_re_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  material_change_detected boolean := false;
begin
  if old.status = 'Approved' and new.status <> 'Disputed' then
    material_change_detected :=
      new.supplier_id is distinct from old.supplier_id
      or new.invoice_date is distinct from old.invoice_date
      or new.due_date is distinct from old.due_date
      or new.subtotal is distinct from old.subtotal
      or new.tax_total is distinct from old.tax_total
      or new.total is distinct from old.total;

    if material_change_detected then
      new.status := 'Needs Review';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_supplier_invoice_re_review on public.supplier_invoices;
create trigger prepare_supplier_invoice_re_review
before update on public.supplier_invoices
for each row execute function public.prepare_supplier_invoice_re_review();

create or replace function public.log_supplier_invoice_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_fields text[] := array[]::text[];
  material_fields text[] := array[]::text[];
begin
  if tg_op = 'INSERT' then
    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.id,
      'created',
      case
        when coalesce(trim(new.invoice_number), '') <> '' then format('Supplier invoice %s created.', new.invoice_number)
        else 'Supplier invoice created.'
      end,
      jsonb_build_object(
        'status', new.status,
        'supplier_id', new.supplier_id
      ),
      new.created_by
    );
    return new;
  end if;

  if new.supplier_id is distinct from old.supplier_id then
    changed_fields := array_append(changed_fields, 'supplier');
    material_fields := array_append(material_fields, 'supplier');
  end if;
  if new.invoice_number is distinct from old.invoice_number then
    changed_fields := array_append(changed_fields, 'invoice_number');
  end if;
  if new.invoice_date is distinct from old.invoice_date then
    changed_fields := array_append(changed_fields, 'invoice_date');
    material_fields := array_append(material_fields, 'invoice_date');
  end if;
  if new.due_date is distinct from old.due_date then
    changed_fields := array_append(changed_fields, 'due_date');
    material_fields := array_append(material_fields, 'due_date');
  end if;
  if new.subtotal is distinct from old.subtotal then
    changed_fields := array_append(changed_fields, 'subtotal');
    material_fields := array_append(material_fields, 'subtotal');
  end if;
  if new.tax_total is distinct from old.tax_total then
    changed_fields := array_append(changed_fields, 'tax_total');
    material_fields := array_append(material_fields, 'tax_total');
  end if;
  if new.total is distinct from old.total then
    changed_fields := array_append(changed_fields, 'total');
    material_fields := array_append(material_fields, 'total');
  end if;
  if new.notes is distinct from old.notes then
    changed_fields := array_append(changed_fields, 'notes');
  end if;

  if array_length(changed_fields, 1) is not null then
    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.id,
      'edited',
      'Supplier invoice details updated.',
      jsonb_build_object('changed_fields', changed_fields),
      auth.uid()
    );
  end if;

  if new.status is distinct from old.status then
    if old.status = 'Approved'
      and new.status = 'Needs Review'
      and array_length(material_fields, 1) is not null then
      perform public.record_supplier_invoice_activity_event(
        new.organization_id,
        new.id,
        'reverted_to_needs_review',
        'Invoice changes require the invoice to be reviewed again.',
        jsonb_build_object(
          'changed_fields', material_fields,
          'from_status', old.status,
          'to_status', new.status
        ),
        auth.uid()
      );
    elsif new.status = 'Needs Review' and old.status <> 'Approved' then
      perform public.record_supplier_invoice_activity_event(
        new.organization_id,
        new.id,
        'sent_for_review',
        'Supplier invoice sent to review.',
        jsonb_build_object('from_status', old.status, 'to_status', new.status),
        auth.uid()
      );
    elsif new.status = 'Approved' then
      perform public.record_supplier_invoice_activity_event(
        new.organization_id,
        new.id,
        'approved',
        'Supplier invoice approved.',
        jsonb_build_object('from_status', old.status, 'to_status', new.status),
        auth.uid()
      );
    elsif new.status = 'Disputed' then
      perform public.record_supplier_invoice_activity_event(
        new.organization_id,
        new.id,
        'disputed',
        'Supplier invoice marked disputed.',
        jsonb_build_object('from_status', old.status, 'to_status', new.status),
        auth.uid()
      );
    else
      perform public.record_supplier_invoice_activity_event(
        new.organization_id,
        new.id,
        'status_changed',
        format('Supplier invoice status changed from %s to %s.', old.status, new.status),
        jsonb_build_object('from_status', old.status, 'to_status', new.status),
        auth.uid()
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists log_supplier_invoice_changes on public.supplier_invoices;
create trigger log_supplier_invoice_changes
after insert or update on public.supplier_invoices
for each row execute function public.log_supplier_invoice_changes();

create or replace function public.log_supplier_invoice_approval_step()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(trim(new.decision_notes), '') <> '' then
    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.supplier_invoice_id,
      'approval_note_added',
      'Approval note added.',
      jsonb_build_object(
        'approval_step_id', new.id,
        'status', new.status
      ),
      new.approver_user_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_supplier_invoice_approval_step
  on public.supplier_invoice_approval_steps;
create trigger log_supplier_invoice_approval_step
after insert on public.supplier_invoice_approval_steps
for each row execute function public.log_supplier_invoice_approval_step();

create or replace function public.handle_supplier_invoice_match_activity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice_row public.supplier_invoices%rowtype;
  purchase_order_number_value text;
  event_type text;
  event_message text;
  event_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    select *
    into invoice_row
    from public.supplier_invoices
    where id = old.supplier_invoice_id
      and organization_id = old.organization_id;

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

    if invoice_row.id is not null and invoice_row.status = 'Approved' then
      update public.supplier_invoices
      set status = 'Needs Review'
      where id = invoice_row.id
        and organization_id = invoice_row.organization_id
        and status = 'Approved';

      perform public.record_supplier_invoice_activity_event(
        old.organization_id,
        old.supplier_invoice_id,
        'reverted_to_needs_review',
        'Purchase order matching changed after approval. Invoice sent back to review.',
        jsonb_build_object(
          'reason', 'match_removed',
          'purchase_order_id', old.purchase_order_id
        ),
        auth.uid()
      );
    end if;

    perform public.record_supplier_invoice_activity_event(
      old.organization_id,
      old.supplier_invoice_id,
      event_type,
      event_message,
      event_metadata,
      auth.uid()
    );

    return old;
  end if;

  select *
  into invoice_row
  from public.supplier_invoices
  where id = new.supplier_invoice_id
    and organization_id = new.organization_id;

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
      and new.purchase_order_id is not distinct from old.purchase_order_id then
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

  if invoice_row.id is not null
    and invoice_row.status = 'Approved'
    and (
      tg_op = 'INSERT'
      or new.matched_amount is distinct from old.matched_amount
      or new.match_status is distinct from old.match_status
      or new.purchase_order_id is distinct from old.purchase_order_id
    ) then
    update public.supplier_invoices
    set status = 'Needs Review'
    where id = invoice_row.id
      and organization_id = invoice_row.organization_id
      and status = 'Approved';

    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.supplier_invoice_id,
      'reverted_to_needs_review',
      'Purchase order matching changed after approval. Invoice sent back to review.',
      jsonb_build_object(
        'reason', case when tg_op = 'INSERT' then 'match_added' else 'match_updated' end,
        'purchase_order_id', new.purchase_order_id
      ),
      auth.uid()
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
