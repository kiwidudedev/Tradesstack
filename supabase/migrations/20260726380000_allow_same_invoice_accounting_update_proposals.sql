begin;

alter table public.organization_accounting_push_proposals
  drop constraint accounting_push_proposal_operation_check;

alter table public.organization_accounting_push_proposals
  add constraint accounting_push_proposal_operation_check
    check (operation in (
      'INITIAL_EXPORT',
      'REPLACEMENT_EXPORT',
      'UPDATE_EXISTING_INVOICE',
      'ACCOUNTING_UPDATE',
      'BLOCKED'
    ));

commit;
