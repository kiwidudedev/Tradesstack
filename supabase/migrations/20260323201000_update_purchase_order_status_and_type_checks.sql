-- Normalize existing purchase order status values to the new PO workflow statuses.
update public.project_purchase_orders
set status = case status
  when 'Priced' then 'Pending Approval'
  when 'Sent' then 'Issued'
  when 'Client Review' then 'Issued'
  when 'Rejected' then 'Cancelled'
  else status
end;

update public.project_purchase_order_status_events
set from_status = case from_status
  when 'Priced' then 'Pending Approval'
  when 'Sent' then 'Issued'
  when 'Client Review' then 'Issued'
  when 'Rejected' then 'Cancelled'
  else from_status
end;

update public.project_purchase_order_status_events
set to_status = case to_status
  when 'Priced' then 'Pending Approval'
  when 'Sent' then 'Issued'
  when 'Client Review' then 'Issued'
  when 'Rejected' then 'Cancelled'
  else to_status
end;

-- Normalize existing PO type/origin values to the new PO type set.
update public.project_purchase_orders
set origin = case origin
  when 'Client Request' then 'Variation Order'
  when 'Drawing Revision' then 'Variation Order'
  when 'Site Instruction' then 'Site Expense'
  when 'RFI' then 'Variation Order'
  when 'Unknown' then 'Other'
  else origin
end;

alter table public.project_purchase_orders
  drop constraint if exists project_purchase_orders_status_check;

alter table public.project_purchase_orders
  add constraint project_purchase_orders_status_check
  check (status in ('Draft', 'Pending Approval', 'Approved', 'Issued', 'Received', 'Invoiced', 'Cancelled'));

alter table public.project_purchase_orders
  drop constraint if exists project_purchase_orders_origin_check;

alter table public.project_purchase_orders
  add constraint project_purchase_orders_origin_check
  check (origin in ('Material Supply', 'Subcontract Work', 'Plant / Equipment Hire', 'Site Expense', 'Freight / Delivery', 'Variation Order', 'General Purchase', 'Other'));

alter table public.project_purchase_order_status_events
  drop constraint if exists project_purchase_order_status_events_from_check;

alter table public.project_purchase_order_status_events
  add constraint project_purchase_order_status_events_from_check
  check (from_status is null or from_status in ('Draft', 'Pending Approval', 'Approved', 'Issued', 'Received', 'Invoiced', 'Cancelled'));

alter table public.project_purchase_order_status_events
  drop constraint if exists project_purchase_order_status_events_to_check;

alter table public.project_purchase_order_status_events
  add constraint project_purchase_order_status_events_to_check
  check (to_status in ('Draft', 'Pending Approval', 'Approved', 'Issued', 'Received', 'Invoiced', 'Cancelled'));
