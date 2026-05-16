drop policy if exists "Privileged members can update supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;

create policy "Privileged members can update supplier invoice line allocations"
on public.supplier_invoice_line_allocations
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.write')
  or public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.review')
)
with check (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.write')
  or public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.review')
);
