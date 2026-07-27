begin;

-- The first adoption implementation compared project_claims.updated_at::text with
-- the ISO-8601 representation returned by PostgREST. Both values represented the
-- same instant but PostgreSQL rendered its text with a space and shortened UTC
-- offset. Preserve the fully audited adoption body and normalize only this input
-- at a service-only compatibility boundary.
alter function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)
  rename to adopt_legacy_voided_payment_claim_phase2c_v1;

revoke all on function
  public.adopt_legacy_voided_payment_claim_phase2c_v1(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.adopt_legacy_voided_payment_claim_phase2c(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_source_revision timestamptz;
  v_normalized_input jsonb;
begin
  begin
    v_source_revision := (p_input->>'sourceOptimisticRevision')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'The Payment Claim optimistic revision is invalid.'
        using errcode = '22007';
  end;

  if v_source_revision is null then
    raise exception 'The Payment Claim optimistic revision is missing.'
      using errcode = '22007';
  end if;

  v_normalized_input := jsonb_set(
    p_input,
    '{sourceOptimisticRevision}',
    to_jsonb(v_source_revision::text),
    true
  );

  return public.adopt_legacy_voided_payment_claim_phase2c_v1(
    v_normalized_input
  );
end;
$$;

revoke all on function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)
from public, anon, authenticated;
grant execute on function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)
to service_role;

-- Detailed provider/database causes remain server-side. The browser receives only
-- the safe code, message, and opaque support reference.
create table public.organization_accounting_operation_errors (
  support_reference uuid primary key,
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  source_document_type text not null,
  source_document_id uuid not null,
  accounting_document_id uuid null
    references public.organization_accounting_documents(id) on delete restrict,
  operation text not null,
  safe_code text not null,
  internal_sqlstate text null,
  internal_message text not null,
  internal_details text null,
  internal_hint text null,
  failed_constraint text null,
  created_at timestamptz not null default now(),
  constraint accounting_operation_error_source_check
    check (source_document_type in ('project_claim', 'retention_claim', 'supplier_invoice')),
  constraint accounting_operation_error_text_check check (
    char_length(trim(operation)) > 0
    and char_length(trim(safe_code)) > 0
    and char_length(trim(internal_message)) > 0
  )
);

create or replace function public.reject_accounting_operation_error_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Accounting operation errors are append-only.'
    using errcode = '55000';
end;
$$;

create trigger reject_accounting_operation_error_mutation
before update or delete on public.organization_accounting_operation_errors
for each row execute function public.reject_accounting_operation_error_mutation();

alter table public.organization_accounting_operation_errors enable row level security;
alter table public.organization_accounting_operation_errors force row level security;

revoke all on table public.organization_accounting_operation_errors
from public, anon, authenticated;
grant insert on table public.organization_accounting_operation_errors
to service_role;

commit;
