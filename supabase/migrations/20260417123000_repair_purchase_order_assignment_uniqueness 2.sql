begin;

delete from public.project_purchase_order_assignments duplicate_row
using public.project_purchase_order_assignments keeper_row
where duplicate_row.id < keeper_row.id
  and duplicate_row.project_id = keeper_row.project_id
  and duplicate_row.purchase_order_id = keeper_row.purchase_order_id
  and duplicate_row.organization_member_id = keeper_row.organization_member_id;

alter table public.project_purchase_order_assignments
  drop constraint if exists project_purchase_order_assignments_unique_project_po_member;

alter table public.project_purchase_order_assignments
  add constraint project_purchase_order_assignments_unique_project_po_member
  unique (project_id, purchase_order_id, organization_member_id);

commit;
