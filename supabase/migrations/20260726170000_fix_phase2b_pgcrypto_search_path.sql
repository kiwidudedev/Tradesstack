begin;

alter function public.complete_payment_claim_initial_push_phase2b(
  uuid,
  text,
  uuid,
  jsonb
) set search_path = public, private, extensions;

commit;
