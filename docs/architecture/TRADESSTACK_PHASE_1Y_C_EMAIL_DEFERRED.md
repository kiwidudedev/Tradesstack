# TradesStack Phase 1Y-C — Email and Auth Delivery Deferral

## Status

**DEFERRED — PROVIDER ACTIVATION NOT YET APPROVED.**

The owner explicitly directed that Resend and Supabase Auth email must not be
commissioned yet. This is an operational sequencing decision, not evidence
that the existing email architecture is removable or defective.

## Scope of this deferral

No email or provider action was taken. In particular, this phase did not:

- create or configure a Resend account or API key;
- configure Supabase Auth SMTP;
- change sender addresses, DNS, domain verification or callbacks;
- change GitHub, Vercel or Supabase secrets;
- send an email or invite;
- disable, remove or bypass email-dependent application behavior.

The existing paths remain authoritative and preserved:

- `supabase/functions/send-invite-email/index.ts` for provider-backed invite
  delivery;
- `app/api/contact/route.ts` for contact delivery;
- `supabase/config.toml` and hosted Supabase Auth configuration for the later
  confirmation/reset-email boundary.

## Current classification

- **CURRENT:** Alpha email providers and Auth SMTP are not commissioned.
- **DEFERRED:** Resend contact/invite delivery and Supabase Auth confirmation,
  recovery and reset delivery.
- **NON-GOAL:** Treating missing provider credentials as permission to alter
  email-dependent workflows.
- **TARGET:** A separately approved provider commissioning pass with controlled
  sender/domain verification, server-only secrets, a controlled test recipient,
  and independent Auth SMTP verification.

## Evidence and consequence

The source audit confirms that the application has two distinct email
boundaries: Resend-backed contact/invite delivery and Supabase Auth delivery.
Neither can be live-proven without provider credentials and an approved sender
configuration. The hosted Alpha application remains usable for the already
commissioned non-email flows; invite and transactional email are not claimed
as production-ready.

The current Alpha recheck found no email-provider secret names in the private
repository secret store. The active Alpha workflows remain limited to encrypted
backup/restore verification and the commissioned Takeoff worker; Vercel cron is
not configured for the current Hobby deployment. Alpha's public root returned
HTTP 200 during this recheck. These observations confirm that the deferral has
not silently activated an email, SMTP, DNS or cron boundary.

No database, migration, Storage, Auth, worker, cron, UI or integration file
was changed by this deferral.

## Next independent capability

Continue with **Phase 1Y-D — provider-independent hosted workflow completion**.
The next pass should close and record non-provider workflow evidence, beginning
with the smallest safe report/export or read/write workflow that has real
synthetic data available. It must not activate Vercel cron on Hobby, enable
background jobs, or use email as a fixture-provisioning mechanism.

Provider-dependent work remains separately deferred:

- email/Auth delivery;
- Xero;
- AI/Anthropic/OpenAI;
- nonessential cron jobs that depend on those providers;
- custom DNS and third-party monitoring.
