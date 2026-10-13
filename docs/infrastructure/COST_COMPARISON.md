# Infrastructure cost comparison

All values below are planning estimates in USD/month, not provider invoices. They use the published rates linked below and exclude provider-specific discounts, taxes and negotiated enterprise pricing. The checked arithmetic is also encoded in `lib/infrastructure/cost-model.ts`.

## Published inputs

- Workers Paid: $5/account/month, 10 million requests and 30 million CPU-ms included; overage is $0.30/million requests and $0.02/million CPU-ms.
- Workers for Platforms: $25/month, 20 million requests and 60 million CPU-ms included, plus 1,000 scripts; useful for centrally dispatching many customer Workers but not required for one isolated Worker per customer.
- R2 Standard: $0.015/GB-month, Class A $4.50/million, Class B $0.36/million, free egress, with 10 GB, 1 million Class A and 10 million Class B free each month at account level.
- Workflows: uses Workers rates and adds $0.80 per 100,000 steps after 500,000 included and $0.20/GB-month after 1 GB included on the paid plan.

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers for Platforms pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/), [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

## Scenario assumptions

Small = 20 GB stored/customer, 1.5M dynamic requests/customer, 6M CPU-ms/customer, 100k reads and 10k writes/month.

Medium = 100 GB, 4M dynamic requests, 16M CPU-ms, 500k reads and 50k writes/month.

Large = 500 GB, 12M dynamic requests, 50M CPU-ms, 2M reads and 200k writes/month.

Cloudflare amounts are rounded upward at the account level and assume one paid account with shared free allowances. They are not a promise of a per-customer bill. AI and heavy compute are shown separately because they dominate construction workloads.

## Cloudflare edge + R2 estimate

| Customers | Small | Medium | Large |
|---:|---:|---:|---:|
| 1 | $5.15 | $6.35 | $13.35 |
| 5 | $6.35 | $16.35 | $61.75 |
| 10 | $9.95 | $31.45 | $130.35 |
| 25 | $23.00 | $78.78 | $336.15 |
| 50 | $44.75 | $164.40 | $679.15 |
| 100 | $88.25 | $335.65 | $1,365.15 |

These totals are the modeled Workers Paid subscription/overage plus R2 storage and operation overage. They exclude Supabase and compute, and therefore are not total TradesStack operating cost.

## Other infrastructure comparison

| Option | Strength | Cost/fit conclusion |
|---|---|---|
| Current Vercel + Supabase Storage | Lowest migration risk and already commissioned | Keep as rollback/Alpha baseline until Cloudflare passes real workflows. |
| Cloudflare Workers + Supabase + R2 | Low egress/storage cost and strong edge distribution | Best long-term web/file target if adapter and signed private access pass. |
| Workers for Platforms | Central dispatch and many scripts | $25 fixed base is attractive at scale, but adds platform control-plane complexity and does not solve heavy PDF compute. |
| Supabase Storage | Native RLS-adjacent integration, TUS already working | Keep as legacy provider and rollback path; migration savings are not enough to justify a blind cutover. |
| Cloudflare Workflows/Queues | Durable orchestration and retries | Good dispatcher/orchestration; not a substitute for Node/native PDF compute. |
| Dedicated Node worker | Full PDF/native dependency compatibility | Required for current takeoff renderer until a measured Worker proof passes. |
| D1 | Edge-local SQLite | Rejected: conflicts with authoritative Supabase PostgreSQL/RLS model and creates split-brain commercial data. |

## Costs intentionally kept separate

| Cost area | Planning treatment | Why it is not included in the Cloudflare table |
|---|---|---|
| Supabase | Use the account's current project/compute/egress invoice; a $25/project Pro baseline is a planning placeholder only, not verified billing for this account. | Plan features, compute, disk, egress and add-ons vary by account and usage. |
| Dedicated Node takeoff worker | Budget as a separate worker allocation after measured job duration and concurrency; no provider price is asserted here. | PDF.js/native canvas rendering is not Cloudflare edge work and no production compute provider has been selected. |
| AI usage | Budget from measured input/output tokens per workflow and the selected model; do not use a flat “AI cost” as an invoice. | Provider, model, caching and usage mix are not fixed by the repository. |
| Monitoring, backups and domains | Measure against the chosen products and retention policy. | No live account, DNS, monitoring or backup billing was inspected. |

## Missing costs to measure

Supabase plan/egress/database usage, AI token spend, dedicated worker CPU/storage, monitoring retention, R2 bucket count limits, Workers account structure, and customer-specific domains remain unverified. Owner Control Plane usage reporting must label these as provider-reported, attributed, or estimated rather than fabricating a per-customer invoice.
