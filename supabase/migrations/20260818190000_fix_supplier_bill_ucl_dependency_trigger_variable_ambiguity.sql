begin;

-- PL/pgSQL variables previously shared names with table columns. With the
-- default variable-conflict policy, unqualified right-hand operands fail before
-- the trigger can evaluate.
-- Prefix local variables so PO/project writes and their UCL refresh fan-out
-- remain tenant-scoped and unambiguous.
create or replace function public._supplier_bill_ucl_purchase_order_dependency_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_organization_id uuid := nullif(v_row_data->>'organization_id', '')::uuid;
  v_purchase_order_id uuid;
  v_purchase_order_line_id uuid;
  v_dependency record;
begin
  if tg_table_name = 'project_purchase_orders' then
    v_purchase_order_id := nullif(v_row_data->>'id', '')::uuid;
  else
    v_purchase_order_line_id := nullif(v_row_data->>'id', '')::uuid;
    v_purchase_order_id := nullif(v_row_data->>'purchase_order_id', '')::uuid;
  end if;

  for v_dependency in
    select distinct candidate.supplier_invoice_id
    from (
      select m.supplier_invoice_id
      from public.supplier_invoice_purchase_order_matches m
      where m.organization_id = v_organization_id
        and m.purchase_order_id = v_purchase_order_id
      union
      select a.supplier_invoice_id
      from public.supplier_invoice_line_allocations a
      where a.organization_id = v_organization_id
        and (
          a.purchase_order_id = v_purchase_order_id
          or (
            v_purchase_order_line_id is not null
            and a.purchase_order_line_item_id = v_purchase_order_line_id
          )
        )
      union
      select s.supplier_invoice_id
      from public.supplier_invoice_commercial_line_snapshots s
      where s.organization_id = v_organization_id
        and (
          s.purchase_order_id = v_purchase_order_id
          or (
            v_purchase_order_line_id is not null
            and s.purchase_order_line_item_id = v_purchase_order_line_id
          )
        )
      union
      select e.supplier_invoice_id
      from public.project_actual_cost_events e
      where e.organization_id = v_organization_id
        and (
          e.purchase_order_id = v_purchase_order_id
          or (
            v_purchase_order_line_id is not null
            and e.purchase_order_line_item_id = v_purchase_order_line_id
          )
        )
    ) candidate
    where candidate.supplier_invoice_id is not null
  loop
    perform public._enqueue_supplier_bill_ucl_refresh(
      v_organization_id,
      v_dependency.supplier_invoice_id,
      'supplier_bill_po_match_changed',
      80,
      false
    );
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public._supplier_bill_ucl_project_dependency_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_organization_id uuid := nullif(v_row_data->>'organization_id', '')::uuid;
  v_project_id uuid := nullif(v_row_data->>'id', '')::uuid;
  v_invoice record;
begin
  for v_invoice in
    select distinct candidate.supplier_invoice_id
    from (
      select l.supplier_invoice_id
      from public.supplier_invoice_lines l
      where l.organization_id = v_organization_id
        and l.project_id = v_project_id
      union
      select a.supplier_invoice_id
      from public.supplier_invoice_line_allocations a
      where a.organization_id = v_organization_id
        and a.project_id = v_project_id
      union
      select m.supplier_invoice_id
      from public.supplier_invoice_purchase_order_matches m
      join public.project_purchase_orders po
        on po.organization_id = v_organization_id
       and po.id = m.purchase_order_id
      where m.organization_id = v_organization_id
        and po.project_id = v_project_id
    ) candidate
    where candidate.supplier_invoice_id is not null
  loop
    perform public._enqueue_supplier_bill_ucl_refresh(
      v_organization_id,
      v_invoice.supplier_invoice_id,
      'supplier_bill_project_scope_changed',
      100,
      false
    );
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public._supplier_bill_ucl_purchase_order_dependency_trigger()
  from public, anon, authenticated;
revoke all on function public._supplier_bill_ucl_project_dependency_trigger()
  from public, anon, authenticated;

commit;
