begin;

-- Replacement confirmation inherited the pre-Phase-2B textual timestamptz
-- comparison. Keep the complete confirmation transaction unchanged and
-- normalize only the signed PostgREST timestamp representation before entering
-- it. A genuinely different instant still fails the original locked-row check.
alter function public.confirm_payment_claim_replacement_phase2c(jsonb)
  rename to confirm_payment_claim_replacement_phase2c_v1;

revoke all on function
  public.confirm_payment_claim_replacement_phase2c_v1(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.confirm_payment_claim_replacement_phase2c(
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

  return public.confirm_payment_claim_replacement_phase2c_v1(
    v_normalized_input
  );
end;
$$;

revoke all on function public.confirm_payment_claim_replacement_phase2c(jsonb)
from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_replacement_phase2c(jsonb)
to service_role;

commit;
