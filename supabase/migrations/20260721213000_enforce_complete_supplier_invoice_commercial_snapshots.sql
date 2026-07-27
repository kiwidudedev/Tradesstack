begin;

create or replace function public.assert_supplier_invoice_commercial_snapshot_completeness(
  p_commercial_approval_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval public.supplier_invoice_commercial_approvals%rowtype;
  v_expected_count integer;
  v_snapshot_count integer;
  v_distinct_line_count integer;
begin
  select * into v_approval
  from public.supplier_invoice_commercial_approvals
  where id = p_commercial_approval_id;

  if not found or v_approval.status <> 'approved' then
    return;
  end if;

  select count(*) into v_expected_count
  from public.supplier_invoice_lines
  where organization_id = v_approval.organization_id
    and supplier_invoice_id = v_approval.supplier_invoice_id;

  select count(*), count(distinct snapshot.supplier_invoice_line_id)
  into v_snapshot_count, v_distinct_line_count
  from public.supplier_invoice_commercial_line_snapshots snapshot
  where snapshot.organization_id = v_approval.organization_id
    and snapshot.supplier_invoice_id = v_approval.supplier_invoice_id
    and snapshot.commercial_approval_id = v_approval.id;

  if v_expected_count = 0
    or v_snapshot_count <> v_expected_count
    or v_distinct_line_count <> v_expected_count
    or exists (
      select 1
      from public.supplier_invoice_lines line
      left join public.supplier_invoice_commercial_line_snapshots snapshot
        on snapshot.commercial_approval_id = v_approval.id
        and snapshot.supplier_invoice_line_id = line.id
      where line.organization_id = v_approval.organization_id
        and line.supplier_invoice_id = v_approval.supplier_invoice_id
      group by line.id
      having count(snapshot.id) <> 1
    ) then
    raise exception 'Commercial approval requires one complete line snapshot per Supplier Invoice line.';
  end if;
end;
$$;

revoke all on function public.assert_supplier_invoice_commercial_snapshot_completeness(uuid)
  from public, anon, authenticated;
grant execute on function public.assert_supplier_invoice_commercial_snapshot_completeness(uuid)
  to service_role;

create or replace function public.enforce_supplier_invoice_commercial_approval_snapshot_completeness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_supplier_invoice_commercial_snapshot_completeness(new.id);
  return new;
end;
$$;

create or replace function public.enforce_supplier_invoice_commercial_snapshot_mutation_completeness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_supplier_invoice_commercial_snapshot_completeness(old.commercial_approval_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_supplier_invoice_commercial_snapshot_completeness(new.commercial_approval_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_supplier_invoice_commercial_approval_snapshot_completeness()
  from public, anon, authenticated;
revoke all on function public.enforce_supplier_invoice_commercial_snapshot_mutation_completeness()
  from public, anon, authenticated;
grant execute on function public.enforce_supplier_invoice_commercial_approval_snapshot_completeness()
  to service_role;
grant execute on function public.enforce_supplier_invoice_commercial_snapshot_mutation_completeness()
  to service_role;

drop trigger if exists enforce_supplier_invoice_commercial_approval_snapshot_completeness
  on public.supplier_invoice_commercial_approvals;
create constraint trigger enforce_supplier_invoice_commercial_approval_snapshot_completeness
after insert or update of status on public.supplier_invoice_commercial_approvals
deferrable initially deferred
for each row
execute function public.enforce_supplier_invoice_commercial_approval_snapshot_completeness();

drop trigger if exists enforce_supplier_invoice_commercial_snapshot_mutation_completeness
  on public.supplier_invoice_commercial_line_snapshots;
create constraint trigger enforce_supplier_invoice_commercial_snapshot_mutation_completeness
after insert or update or delete on public.supplier_invoice_commercial_line_snapshots
deferrable initially deferred
for each row
execute function public.enforce_supplier_invoice_commercial_snapshot_mutation_completeness();

do $$
declare
  malformed record;
begin
  for malformed in
    select approval.supplier_invoice_id
    from public.supplier_invoice_commercial_approvals approval
    left join public.supplier_invoice_commercial_line_snapshots snapshot
      on snapshot.commercial_approval_id = approval.id
    where approval.status = 'approved'
      and not exists (
        select 1
        from public.organization_accounting_documents document
        where document.organization_id = approval.organization_id
          and document.local_document_type = 'supplier_invoice'
          and document.local_document_id = approval.supplier_invoice_id
          and document.export_status in ('queued', 'exporting', 'exported', 'attention_required')
      )
    group by approval.id, approval.supplier_invoice_id
    having count(snapshot.id) <> (
      select count(*)
      from public.supplier_invoice_lines line
      where line.organization_id = approval.organization_id
        and line.supplier_invoice_id = approval.supplier_invoice_id
    )
      or count(distinct snapshot.supplier_invoice_line_id) <> (
        select count(*)
        from public.supplier_invoice_lines line
        where line.organization_id = approval.organization_id
          and line.supplier_invoice_id = approval.supplier_invoice_id
      )
  loop
    perform public.invalidate_supplier_invoice_commercial_approval(
      malformed.supplier_invoice_id,
      'Commercial approval line snapshots were incomplete.',
      'commercial_snapshot_integrity',
      null
    );
  end loop;
end;
$$;

commit;
