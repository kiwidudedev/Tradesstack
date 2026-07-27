begin;

-- Xero receives the commercial Payment Claim number directly. Enforce that
-- identity at the Xero-organisation boundary without rewriting any claim.
create unique index if not exists project_claims_org_claim_number_unique_idx
  on public.project_claims (organization_id, claim_number);

commit;
