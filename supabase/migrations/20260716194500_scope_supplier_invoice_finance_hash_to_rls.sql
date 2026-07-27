begin;

create or replace function public.supplier_invoice_finance_version_hash(p_invoice_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        i.id::text,
        coalesce(i.supplier_id::text, ''),
        public.normalize_supplier_invoice_number(coalesce(i.invoice_number, '')),
        coalesce(i.invoice_date::text, ''),
        coalesce(i.due_date::text, ''),
        coalesce(i.currency, ''),
        coalesce(i.subtotal::text, ''),
        coalesce(i.tax_total::text, ''),
        coalesce(i.total::text, ''),
        coalesce((
          select string_agg(
            concat_ws(
              ':',
              l.id::text,
              l.description,
              l.quantity::text,
              l.unit_price::text,
              l.line_total::text,
              l.tax_amount::text,
              l.sort_order::text
            ),
            ',' order by l.sort_order, l.id
          )
          from public.supplier_invoice_lines l
          where l.supplier_invoice_id = i.id
        ), ''),
        coalesce((
          select string_agg(
            concat_ws(
              ':',
              a.id::text,
              coalesce(a.purchase_order_id::text, ''),
              coalesce(a.purchase_order_line_item_id::text, ''),
              coalesce(a.project_id::text, ''),
              coalesce(a.allocated_quantity::text, ''),
              a.allocated_amount::text,
              a.approval_status,
              coalesce(a.accounting_mapping_id::text, ''),
              coalesce(a.accounting_tax_rate_id::text, ''),
              a.tax_resolution_status
            ),
            ',' order by a.supplier_invoice_line_id, a.allocation_sequence, a.id
          )
          from public.supplier_invoice_line_allocations a
          where a.supplier_invoice_id = i.id
        ), ''),
        coalesce((
          select string_agg(
            concat_ws(
              ':',
              po.id::text,
              coalesce(po.supplier_id::text, ''),
              po.status,
              po.total_purchase_order_price::text,
              po_line.id::text,
              po_line.description,
              po_line.quantity::text,
              po_line.rate::text,
              po_line.total::text
            ),
            ',' order by po.id, po_line.id
          )
          from public.supplier_invoice_line_allocations a
          join public.project_purchase_orders po on po.id = a.purchase_order_id
          join public.project_purchase_order_line_items po_line
            on po_line.id = a.purchase_order_line_item_id
          where a.supplier_invoice_id = i.id
        ), '')
      ),
      'sha256'
    ),
    'hex'
  )
  from public.supplier_invoices i
  where i.id = p_invoice_id;
$$;

grant execute on function public.supplier_invoice_finance_version_hash(uuid)
  to authenticated;

commit;
