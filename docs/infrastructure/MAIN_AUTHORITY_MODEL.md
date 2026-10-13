# Main authority model

Updated 2026-10-10.

## Main

TradesStack Main is the authoritative reusable product codebase, migration source, release governance source, and test source. It is not a customer-facing production application and does not require a continuously running public Worker.

Main is exercised through local development, CI, Cloudflare Worker-runtime previews, and disposable environments. Any Cloudflare target must be selected explicitly. Unqualified deployment is disabled so Main automation cannot accidentally publish a public Worker or bind Alpha's private R2 bucket.

## Alpha

TradesStack Alpha is the operational reference implementation. It is deployed separately on Cloudflare Workers Paid, uses its own Supabase project, secrets, and private R2 bucket, and is validated against an approved Main release. Alpha-only deployment configuration and scheduled Node takeoff execution remain outside Main's customer data boundary.

## Release flow

```text
Main source and migrations -> approved release -> Alpha validation -> future customer implementations
```

Reusable fixes discovered while commissioning Alpha belong in Main through the normal release process. Alpha secrets, customer data, and environment-specific configuration do not enter Main source control.

## Storage and compute boundaries

- Supabase PostgreSQL, Auth, RLS, metadata, and permissions remain authoritative.
- R2 is private and accessed only after application authorization; Supabase Storage remains the rollback provider.
- Native PDF/canvas rendering runs in the bounded Node-compatible Alpha worker, not inside Cloudflare Workers.
- The Owner Control Plane and automated customer provisioning remain deferred.
- Existing Vercel deployments remain available for rollback; no DNS cutover or service cancellation is part of this model.
