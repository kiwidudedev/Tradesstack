create or replace function public.save_supplier_invoice_capture(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_supplier_po_reference text,
  p_invoice_date date,
  p_due_date date,
  p_currency text,
  p_subtotal numeric,
  p_tax_total numeric,
  p_total numeric,
  p_notes text,
  p_source text,
  p_lines jsonb default '[]'::jsonb,
  p_create boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_line jsonb;
  v_line_id uuid;
  v_keep_line_ids uuid[] := '{}';
begin
  select m.organization_id into v_organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;

  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.capture') then
    raise exception 'You do not have permission to capture Supplier Invoices.';
  end if;
  if p_invoice_id is null then raise exception 'Supplier Invoice ID is required.'; end if;
  if p_supplier_id is null or not exists (
    select 1 from public.organization_suppliers s
    where s.id = p_supplier_id and s.organization_id = v_organization_id
  ) then raise exception 'Select a valid Supplier.'; end if;
  if char_length(trim(coalesce(p_invoice_number, ''))) = 0 then
    raise exception 'Enter an invoice number.';
  end if;
  if p_invoice_date is null then raise exception 'Enter an invoice date.'; end if;
  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'Due date cannot be before the invoice date.';
  end if;
  if upper(trim(coalesce(p_currency, ''))) <> 'NZD' then
    raise exception 'Supplier Invoice currency must be NZD.';
  end if;
  if p_subtotal < 0 or p_tax_total < 0 or p_total < 0
    or abs((p_subtotal + p_tax_total) - p_total) > 0.01 then
    raise exception 'Invoice subtotal, tax and total do not reconcile.';
  end if;
  if p_supplier_po_reference is not null
    and char_length(trim(p_supplier_po_reference)) > 120 then
    raise exception 'Supplier PO reference must be 120 characters or fewer.';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Supplier Invoice lines must be an array.';
  end if;

  if exists (
    select 1 from public.supplier_invoices duplicate
    where duplicate.organization_id = v_organization_id
      and duplicate.supplier_id = p_supplier_id
      and public.normalize_supplier_invoice_number(duplicate.invoice_number)
        = public.normalize_supplier_invoice_number(p_invoice_number)
      and duplicate.id <> p_invoice_id
  ) then raise exception 'A Supplier Invoice with this invoice number already exists for the Supplier.';
  end if;

  if p_create then
    insert into public.supplier_invoices (
      id, organization_id, supplier_id, invoice_number, supplier_po_reference,
      invoice_date, due_date, currency, subtotal, tax_total, total, notes,
      status, source, created_by
    ) values (
      p_invoice_id, v_organization_id, p_supplier_id, trim(p_invoice_number),
      nullif(trim(coalesce(p_supplier_po_reference, '')), ''), p_invoice_date,
      p_due_date, 'NZD', p_subtotal, p_tax_total, p_total, trim(coalesce(p_notes, '')),
      'Captured', case when p_source = 'upload' then 'upload' else 'manual' end, auth.uid()
    );
  else
    if exists (
      select 1 from public.organization_accounting_documents d
      where d.organization_id = v_organization_id
        and d.local_document_id = p_invoice_id
        and d.export_status in ('queued', 'exporting', 'exported', 'attention_required')
    ) then raise exception 'This Supplier Invoice is locked by its Xero export state.';
    end if;
    update public.supplier_invoices
    set supplier_id = p_supplier_id,
        invoice_number = trim(p_invoice_number),
        supplier_po_reference = nullif(trim(coalesce(p_supplier_po_reference, '')), ''),
        invoice_date = p_invoice_date,
        due_date = p_due_date,
        currency = 'NZD', subtotal = p_subtotal, tax_total = p_tax_total,
        total = p_total, notes = trim(coalesce(p_notes, ''))
    where id = p_invoice_id and organization_id = v_organization_id;
    if not found then raise exception 'Supplier Invoice not found.'; end if;
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_id := coalesce(nullif(v_line ->> 'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1 from public.supplier_invoice_lines l
      where l.id = v_line_id
        and (l.supplier_invoice_id <> p_invoice_id or l.organization_id <> v_organization_id)
    ) then raise exception 'A Supplier Invoice line does not belong to this invoice.'; end if;
    if char_length(trim(coalesce(v_line ->> 'description', ''))) = 0 then
      raise exception 'Every Supplier Invoice line requires a description.';
    end if;
    if nullif(v_line ->> 'costCodeId', '') is not null and not exists (
      select 1 from public.organization_cost_codes c
      where c.id = (v_line ->> 'costCodeId')::uuid and c.organization_id = v_organization_id
    ) then raise exception 'A Supplier Invoice line cost code does not belong to this organization.'; end if;
    if nullif(v_line ->> 'projectId', '') is not null and not exists (
      select 1 from public.organization_projects p
      where p.id = (v_line ->> 'projectId')::uuid and p.organization_id = v_organization_id
    ) then raise exception 'A Supplier Invoice line project does not belong to this organization.'; end if;
    if coalesce((v_line ->> 'quantity')::numeric, 0) < 0
      or coalesce((v_line ->> 'unitPrice')::numeric, 0) < 0
      or coalesce((v_line ->> 'lineTotal')::numeric, 0) < 0
      or coalesce((v_line ->> 'taxAmount')::numeric, 0) < 0 then
      raise exception 'Supplier Invoice line values cannot be negative.';
    end if;

    insert into public.supplier_invoice_lines (
      id, organization_id, supplier_invoice_id, description, supplier_item_code,
      quantity, unit_price, line_total, tax_amount, cost_code_id, project_id, sort_order
    ) values (
      v_line_id, v_organization_id, p_invoice_id, trim(v_line ->> 'description'),
      nullif(trim(coalesce(v_line ->> 'supplierItemCode', '')), ''),
      coalesce((v_line ->> 'quantity')::numeric, 0),
      coalesce((v_line ->> 'unitPrice')::numeric, 0),
      coalesce((v_line ->> 'lineTotal')::numeric, 0),
      coalesce((v_line ->> 'taxAmount')::numeric, 0),
      nullif(v_line ->> 'costCodeId', '')::uuid,
      nullif(v_line ->> 'projectId', '')::uuid,
      coalesce((v_line ->> 'sortOrder')::integer, cardinality(v_keep_line_ids))
    )
    on conflict (id) do update set
      description = excluded.description,
      supplier_item_code = excluded.supplier_item_code,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      line_total = excluded.line_total,
      tax_amount = excluded.tax_amount,
      cost_code_id = excluded.cost_code_id,
      project_id = excluded.project_id,
      sort_order = excluded.sort_order;
    v_keep_line_ids := array_append(v_keep_line_ids, v_line_id);
  end loop;

  if not p_create then
    delete from public.supplier_invoice_lines l
    where l.organization_id = v_organization_id
      and l.supplier_invoice_id = p_invoice_id
      and not (l.id = any(v_keep_line_ids));
  end if;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (
    v_organization_id, p_invoice_id,
    case when p_create then 'invoice_created' else 'invoice_updated' end,
    case when p_create then 'Supplier Invoice captured by Accounts.' else 'Supplier Invoice capture details updated.' end,
    jsonb_build_object('supplier_po_reference', nullif(trim(coalesce(p_supplier_po_reference, '')), ''),
      'line_count', jsonb_array_length(coalesce(p_lines, '[]'::jsonb))), auth.uid()
  );
  return p_invoice_id;
end;
$$;
