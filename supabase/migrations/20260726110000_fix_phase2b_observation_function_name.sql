begin;

alter function public.record_payment_claim_initial_push_unverified_observation_phase2(
  uuid, jsonb, text
)
rename to record_payment_claim_initial_push_observation_phase2b;

revoke all on function public.record_payment_claim_initial_push_observation_phase2b(
  uuid, jsonb, text
) from public, anon, authenticated;

grant execute on function public.record_payment_claim_initial_push_observation_phase2b(
  uuid, jsonb, text
) to service_role;

commit;
