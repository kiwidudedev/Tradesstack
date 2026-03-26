alter table public.project_quote_line_items
  drop constraint if exists project_quote_line_items_section_check;

alter table public.project_quote_line_items
  add constraint project_quote_line_items_section_check
  check (section in ('Preliminaries', 'Labour', 'Materials', 'Plant', 'Subcontractors', 'Item'));

alter table public.opportunity_quote_line_items
  drop constraint if exists opportunity_quote_line_items_section_check;

alter table public.opportunity_quote_line_items
  add constraint opportunity_quote_line_items_section_check
  check (section in ('Preliminaries', 'Labour', 'Materials', 'Plant', 'Subcontractors', 'Item'));
