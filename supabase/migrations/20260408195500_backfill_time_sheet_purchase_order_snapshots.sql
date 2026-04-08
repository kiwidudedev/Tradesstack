update public.project_time_sheet_entries entry
set
  purchase_order_number = coalesce(nullif(po.purchase_order_number, ''), entry.purchase_order_number, ''),
  purchase_order_title = coalesce(po.purchase_order_title, entry.purchase_order_title, '')
from public.project_purchase_orders po
where entry.purchase_order_id = po.id
  and (
    coalesce(entry.purchase_order_number, '') = ''
    or coalesce(entry.purchase_order_title, '') = ''
  );
