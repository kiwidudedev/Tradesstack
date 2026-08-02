begin;

alter table public.organization_accounting_revision_lines
  drop constraint accounting_revision_line_amounts_check;

alter table public.organization_accounting_revision_lines
  add constraint accounting_revision_line_amounts_check check (
    quantity >= 0
    and (
      (line_kind <> 'retention' and line_amount_minor >= 0 and tax_minor >= 0)
      or
      (
        line_kind = 'retention'
        and line_amount_minor <> 0
        and (
          tax_minor = 0
          or sign(line_amount_minor) = sign(tax_minor)
        )
      )
    )
    and total_minor = line_amount_minor + tax_minor
  );

commit;
