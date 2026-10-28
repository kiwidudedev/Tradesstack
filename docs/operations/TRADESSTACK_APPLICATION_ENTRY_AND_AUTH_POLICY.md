# Application entry and invitation-only authentication policy

Status: 28 October 2026. Applies to every dedicated TradesStack customer
application that consumes a Main release from 1.2.8 onward.

## 1. Application entry

Every customer application is a private workspace, not the public TradesStack
marketing website.

- `GET /` is an entry gate resolved on the server. A signed-in user is sent to
  `/app/dashboard`; everyone else is sent to `/login`.
- `proxy.ts` performs the same redirect before the route renders, so the
  marketing page cannot flash and no intermediate loading screen is shown.
- Role-based routing, onboarding checks and workspace access rules remain in
  `app/app/layout.tsx` and are unchanged.
- The public marketing landing page, early-access route, contact-sales route and
  their newsletter/lead-capture endpoints are not part of a customer
  application. The separate `tradesstack.com` marketing repository is not
  affected by this policy.

## 2. Login and account creation

- Email/password sign-in and password recovery remain available.
- The login page presents a workspace sign-in message and does not sell the
  product, link to public registration or link back to a marketing website.
- There is no public self-registration route. `/register` without an invitation
  token redirects to `/login`.
- An invited user opens `/register?token=...`. The server action validates the
  token against `organization_invites`, checks that the invitation is pending,
  unexpired and addressed to the submitted email, then creates the account
  through the Supabase Auth **admin** API and signs the user in.
- Existing users accept an invitation at `/join?token=...`; organisation
  invitations, resends and the invitation email function continue to use the
  existing controlled flows.
- Administrator-managed account creation is the only supported way to create
  an account. There is no application code path that calls the public
  `supabase.auth.signUp` endpoint.

## 3. Supabase Auth configuration

`supabase/config.toml` is the declarative baseline for new environments:

```toml
[auth]
enable_signup = false

[auth.email]
enable_signup = false
```

`disable_signup = false` was the previous hosted behaviour. Existing customer
Supabase projects must be brought to the same policy through the approved
customer upgrade process — not by editing a customer project ad hoc.

### Hosted project change (per customer, approved upgrade only)

1. Record the current setting from
   `GET https://<ref>.supabase.co/auth/v1/settings` (`disable_signup`) using the
   customer anon key. Do not print keys.
2. In the customer Supabase project: **Authentication → Providers → Email**,
   turn off **Allow new users to sign up**. Keep the Email provider enabled:
   sign-in, password recovery and Auth admin provisioning still require it.
   The equivalent Management API call is:
   `PATCH /v1/projects/<ref>/config/auth` with `{"disable_signup": true}`.
3. **Authentication → URL Configuration**: set the Site URL to the customer
   application URL and add `<site>/reset-password` to the allowed redirect URLs
   so password recovery links return to the reset page.
4. Re-read the settings endpoint and record `disable_signup: true` as upgrade
   evidence.
5. Auth admin account provisioning (`auth.admin.createUser`) continues to work
   while public sign-ups are disabled. Do not disable the Email provider.

If the operator cannot access the customer Supabase project, the application
still exposes no public registration path, but the hosted Auth setting remains
pending and must be reported as an open item. Deployment is not evidence that
the hosted Auth setting changed.

## 4. Verification

- Anonymous `GET /` returns a redirect to `/login`.
- An authenticated `GET /` returns a redirect to `/app/dashboard`.
- `/login` contains no `Create an account`, early-access or marketing links.
- `/register` without a token redirects to `/login`; `/register?token=...`
  requires a valid, pending, unexpired invitation addressed to the signup
  email.
- `/forgot-password` sends a Supabase recovery email and `/reset-password`
  accepts a valid recovery session and updates the password.
- The customer `/api/health` endpoint reports the expected release, source SHA,
  fingerprint, Supabase project ref and Worker name.
