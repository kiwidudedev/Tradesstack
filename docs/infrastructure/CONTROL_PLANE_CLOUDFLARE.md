# Owner Control Plane and Cloudflare

The repository already has the correct governance primitives: approved release manifests under `ops/releases`, customer registry `ops/clients.json`, provider-neutral client configuration packages, registration/promotion scripts, and repeatable provisioning proofs. The Cloudflare work must extend those contracts rather than create a second manual system.

## Required resource record

For each customer record desired and observed values for Main release/fingerprint, repository/ref, Worker name/version/URL, Supabase project ref, storage provider/bucket, migration target, domain, health-check result, last deployment, worker/storage/AI usage source and lifecycle state.

## Idempotent lifecycle

Provision, configure, deploy, health-check, upgrade, pause, resume, diagnose, archive and decommission are explicit states. Each provider operation uses a deterministic customer/resource key and records request/result/error. Retry must reconcile an existing resource before creating another. A customer is not ready until Auth, database, storage, app health and release provenance checks pass.

## Upgrade safety

Only manifests accepted by the existing release validation scripts may be selected. Before upgrade, check customer extensions/configuration, migration compatibility, backup/recovery evidence and rollback target. Deploy the same artifact to Alpha first. Never mark the customer version upgraded before a post-deploy health check.

## Human-controlled actions

Cloudflare account login/MFA, paid-plan activation, billing, DNS changes, production cutover and deletion of legacy storage remain outside autonomous local implementation. The repository is prepared for these actions but none is claimed complete.
