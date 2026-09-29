# TradesStack Phase 1X-A / 1X-A2 — Hosted Product Commissioning

Date: 2026-09-27 (Pacific/Auckland)

## Phase 1X-A2 current verdict

**NO — MATERIAL HOSTED PRODUCT FAILURES REMAIN.** Client Alpha is a real,
private, isolated hosted deployment and the representative identity,
tenancy, private Storage, project, task, quote, opportunity, worksheet,
purchase-order, QA and payment-claim representative proofs are working. It
is not a complete hosted commissioning because Site Safety remains
placeholder-only, direct drawing-set revision/render and cross-org drawing
denial remain open, legacy trade-pack aliases contain route gaps, the deployed
supplier-invoice and project quote worksheet paths still fail, and
restricted-role/export/mobile coverage is incomplete. The representative
trade-pack path now generates, persists, reloads and downloads successfully
after the approved Alpha Storage repair. The Suppliers failure was specifically traced to
missing Alpha Vercel `SUPABASE_SERVICE_ROLE_KEY`; the dedicated Alpha
Supabase project has no Xero connection or records, so Xero remains OFF. The
service-role variable was added as a Production Secret to the existing Alpha
Vercel project, redeploy `dpl_6so1Nnmvm4UwyekHsDoGV58hpp5L` reached Ready, and
the Suppliers route then loaded normally.

The existing Phase 1X-A report below is retained as historical evidence. The
current Phase 1X-A2 findings and acceptance matrix in this addendum supersede
its earlier repository, Node-runtime and deployment observations.

### Durable Master fixes added during the Alpha audit

The Alpha Storage drift exposed a provisioning defect: the Phase 1O baseline
contains the application schema but does not reliably reproduce Supabase-owned
Storage metadata when historical migrations are represented as applied. Master
now contains the forward-only
`20260927110000_reconcile_required_storage_buckets.sql` migration. It
idempotently restores the required bucket catalog and reasserts the direct
Storage policy contracts for drawings, variations, quality photos, tasks,
supplier invoices, material imports and organization logos. It does not edit
historical migrations or create a client-specific fork. The Alpha instance was
repaired with the same contract under explicit authorization; the new
migration remains pending controlled release promotion.

## Final verdict

**PARTIALLY — the fictional Client Alpha hosted proof is operational for the
commissioned representative flows, but full product commissioning and a
controlled hosted release handoff are not complete.**

**Real-customer production: NOT READY.** The remaining gaps are not cosmetic:
the Alpha repository and Vercel Git connection were corrected without
recreating resources, Alpha still has a pending exact-ID cleanup migration
that was intentionally not applied, and
backup/restore, observability, email, worker, cron, integration and full
module acceptance remain incomplete.

This report is an evidence report, not a claim that every route is production
ready. Unconnected providers remain unconnected by design.

## Scope and non-actions

- Existing Master, Alpha Supabase, Alpha Vercel and Alpha GitHub resources were
  not recreated or moved.
- No Vercel Pro purchase, hosting-provider change, custom DNS, Xero, OpenAI,
  Anthropic, Resend, Klaviyo, monitoring provider or takeoff-worker connection.
- No historical migration or Phase 1O baseline was modified.
- The user-authorized Master Supabase forward migration set was already applied
  and reconciled before this commissioning pass.
- Alpha’s manually applied Storage policy was reconciled in the hosted
  migration ledger without replaying its SQL.

## Current hosted inventory

| Resource | Proven state |
|---|---|
| Alpha repository | `kiwidudedev/tradesstack-client-alpha`, private, main at `029d616a9f6db69b546bf0f3457b7399597364c2` |
| Alpha Supabase | `ibjyzpyuqupsxqakpzxj`, Sydney `ap-southeast-2`, Free/NANO, healthy |
| Alpha runtime | Vercel `tradesstack-client-alpha`, Hobby team, Next.js preset, public HTTPS URL |
| Production health | `https://tradesstack-client-alpha.vercel.app/` returned HTTP 200 and contained Client Alpha/TradesStack |
| Vercel protection | Preview-only; production public for the fictional proof |
| Alpha deployed release | `0.0.0-phase1r.2`, Git-connected production deployment `dpl_6so1Nnmvm4UwyekHsDoGV58hpp5L`, source `main`, SHA `029d616a9f6db69b546bf0f3457b7399597364c2` |
| Alpha database | Phase 1O baseline plus forward migrations; ledger matches the deployed release through `20260927100000`; the new reusable Storage reconciliation migration is local/pending promotion |
| Alpha Auth | Two fictional email users: owner and outsider; no password is recorded here |
| Alpha Storage | Private `organization-documents` and repaired private `project-drawing-sets`; synthetic PDF/text objects plus one persisted trade-pack object; owner retrieval and anonymous/outsider denial passed for the existing Files proof |

## Source inventory

The current Master source contains 100 workspace page routes, 112 API route
files, 17 cron route files, 6 Supabase Edge Function directories and 510
migration files. The principal product areas are:

| Area | Source evidence | Hosted commissioning result |
|---|---|---|
| Auth, tenancy, organization, users/permissions | Supabase Auth, middleware, organization membership/RLS, settings routes | PASS for Alpha owner/outsider/anonymous representative checks; full role matrix not complete |
| CRM clients/contacts/notes/files | `leads-clients/clients/**` | Inventory confirmed; not fully live-commissioned |
| Opportunities/tender intake | `leads-clients/opportunities/**` | Inventory confirmed; fictional project creation proof passed; full award path not complete |
| Drawings/takeoff/change detection | takeoff editor, quantities, drawing intelligence, change-detection API | Routes present; render worker and full drawing-set flow not commissioned |
| Pricing worksheets/scope/trade packs | worksheet, scope-builder and trade-pack routes/APIs | Basic worksheet and representative deterministic trade-pack generation, private Storage persistence, reload and owner download passed; full scope/indexing matrix remains open |
| Quotes/revisions/publication | opportunity/project quote routes and commercial publish APIs | PASS for representative synthetic quote mutation; full publication/award lineage not complete |
| Projects/delivery | project dashboard, job-management and project setup | PASS for fictional project existence and isolation; full delivery flow not complete |
| Purchase orders | project preconstruction purchase-order routes/RPCs | Inventory confirmed; live mutation not commissioned |
| Variations | variation routes and publication APIs | Inventory confirmed; live mutation not commissioned |
| Claims/retention | claims/retention routes and PDF APIs | Inventory confirmed; live mutation/export not commissioned |
| Supplier invoices/costs | invoice workspace, extraction and accounting routes | Inventory confirmed; no provider-backed live workflow |
| Materials/suppliers | company materials, suppliers and import APIs | Route inventory confirmed; representative supplier acceptance not rerun in this pass |
| Tasks/issues/defects | todos, task RPCs, quality issue source | PASS for representative task mutation; issue/defect path not complete |
| QA/evidence/sign-off | QA definitions/runs/evidence routes | PASS for representative QA mutation/save behavior; full sign-off/evidence matrix not complete |
| Files/private documents | project/opportunity Files, document APIs and Storage | PASS for upload, authorized retrieval and denial tests |
| PDFs/exports | invoice/claim/export utilities and routes | Source inventory only; download/export acceptance not complete |
| Integrations | Xero settings/API | Deliberately OFF; not connected |
| AI/intelligence | chat, worksheet AI and internal intelligence routes | Deliberately OFF; not connected |
| Cron/background/Edge Functions | `vercel.json`, cron routes and 6 Edge Functions | Deliberately OFF; worker and cron execution not commissioned |
| Responsive/mobile | mobile-oriented source and Edge contracts | Not fully browser/device commissioned |

## Acceptance evidence

### Passed hosted checks

- Public Alpha production returned HTTP 200 and rendered the Client Alpha shell.
- Anonymous `/app/dashboard` redirected to login.
- Anonymous project creation API returned `401 Unauthorized`.
- Fictional owner authentication succeeded.
- Owner created a fictional project; outsider could not access it.
- Tasks, QA and Files routes loaded.
- Owner created and persisted a synthetic task.
- Owner created and persisted synthetic quote `Q-26001-1`.
- Owner created/edited a synthetic QA record; save state and reload persisted.
- Private `organization-documents` bucket was verified `public = false`.
- Application Files flow listed the existing synthetic PDF and the newly uploaded synthetic text object.
- Authorized owner retrieval resolved one document row and produced a usable
  private download path.
- Anonymous raw object access and outsider bearer access were denied by
  Storage with a not-found response.
- Outsider document-resolution RPC returned the documented access-denied error.
- Alpha REST checks confirmed synthetic records in projects/todos/quotes/QA/
  document nodes and two Auth users.
- Alpha hosted policy query verified the exact `owner_id = auth.uid()` insert
  policy for the private document bucket.

### Authorization matrix

| Actor | Own organization/project | Cross-organization/project | Anonymous | Result |
|---|---|---|---|---|
| Fictional owner | Project create/read, task/quote/QA/file operations | Not permitted | Not applicable | PASS where exercised |
| Fictional outsider | Own session exists | Cannot read Alpha project/document | Not applicable | PASS for project and Storage denial |
| Anonymous | No authenticated project access | No authenticated project access | Dashboard redirects; create API 401; object denied | PASS for exercised paths |
| Restricted role / worker | Not provisioned for hosted proof | Not tested | Not applicable | NOT COMMISSIONED |

### Storage evidence

The representative object was a synthetic PDF in private
`organization-documents`. The object was uploaded through the application’s
reservation/TUS path, listed by Files, authorized for the owner, and denied to
anonymous and outsider requests. Storage recovery is not proven: Supabase
database backups do not restore Storage objects, and no object export/restore
test was run.

## Migration and release provenance

Master’s authorized forward migrations were applied with `supabase db push
--include-all`; a linked dry run reported the Master database up to date. The
Alpha CLI inventory initially showed all local/remote versions aligned through
`20260926100000`; the manually applied Storage-policy fix had no history row.
After verifying the hosted policy definition, the exact
`20260927100000_fix_document_storage_owner_policy` version was marked applied
in Alpha migration history without replaying SQL. Alpha local/remote history
now matches through that version.

Alpha dry run still reports
`20260810190000_cleanup_phase1_material_test_fixtures.sql` as pending. It is an
exact-ID cleanup migration and was deliberately not executed against the
fictional hosted database. It requires a separately approved cleanup decision.

The corresponding migration file was committed locally in Alpha as
`b504d3a`, but the push failed because GitHub currently reports
`kiwidudedev/tradesstack-client-alpha` as not found. No replacement repository
was created and no remote was retargeted. The deployed production release
therefore remains the previously proven deployment; its app data/Auth/Storage
were preserved.

## Independence and separation

- Alpha uses its own Supabase project, URL, anon key, Auth users, database and
  Storage bucket.
- No Alpha service-role value is present in the browser environment inventory.
- Master and Alpha references are separate in the client registry.
- Master runtime, database, Auth and Storage were not used as Alpha runtime
  dependencies in the hosted proof.
- Secret scan passed for registry/release/operations metadata. This is a
  guardrail, not a substitute for provider-side secret rotation/audit.
- Master’s current local worktree remains dirty and was preserved; no new
  Phase 1X-A Master commit or push was made.

## Plan/tier and operations assessment

- Vercel: Hobby. Read-only CLI inspection reports Node 24.x; the declared
  project toolchain requires Node `>=22.22.2 <23`. This must be aligned before
  real-customer use.
- Supabase: Free/NANO in Sydney. Managed database backup/PITR capability was
  not verified as available on this tier.
- Storage: private object access works; object backup/export and restore are
  not proven. Database restore alone is insufficient.
- Observability: Vercel deployment/runtime logs and Supabase logs/health are
  available; no third-party monitoring or alert ownership is configured.
- Cron/background work: all nonessential cron, AI, Xero, email and worker
  paths remain off. Enabling them requires separate provider/secrets,
  idempotency, alerting and load proof.
- Retention: retain Alpha as a fictional reference until explicit cleanup
  approval. Do not delete its synthetic Auth, database or Storage evidence as
  part of ordinary work.

## Rollback/redeployment procedure

Application rollback is a Vercel deployment rollback or redeploy of the last
known-good Alpha client SHA/release. It does not reverse database migrations.
Database defects require an approved forward migration; disaster recovery
requires a Supabase database restore/duplicate procedure plus a separate
Storage-object restore. Release changes must be regenerated from Master,
reviewed against client-owned paths, committed to the Alpha repository and
deployed only after repository and toolchain provenance are restored.

## Remaining real-customer hardening

1. Restore or confirm ownership/access to the existing Alpha GitHub repository;
   do not create a replacement without a new owner decision.
2. Align Vercel Node version with the declared release toolchain and prove a
   clean deterministic build.
3. Decide and test database backup/PITR, Storage export/restore, RPO/RTO,
   break-glass access and offboarding.
4. Resolve the pending cleanup migration intentionally; do not apply it by
   accident.
5. Complete all role-level, cross-org and negative tests for every sensitive
   route/RPC/Storage policy.
6. Commission full commercial lineage, award/conversion, procurement,
   variations, claims, invoices, takeoff and PDF/export workflows.
7. Define provider-neutral monitoring and alert ownership.
8. Keep Xero, AI, email, cron, worker and custom DNS disconnected until each
   receives separate authorization and its own acceptance evidence.
9. Add release signing/attestation, protected client branches and a verified
   Master-to-client release handoff.

## Files and checks

Created/updated for this pass:

- `docs/architecture/TRADESSTACK_HOSTED_PRODUCT_COMMISSIONING.md`
- `ops/clients.json`
- `ops/commissioning/client-alpha.json`
- `app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceReviewPanel.tsx`
- `lib/project-pricing-worksheet-route-server.ts`
- `lib/project-pricing-worksheet-route-server.test.ts`
- Alpha local migration record:
  `supabase/migrations/20260927100000_fix_document_storage_owner_policy.sql`

Checks completed:

- Master Supabase push and linked dry run: PASS.
- Alpha migration list and linked dry run: policy version reconciled; cleanup
  migration intentionally pending.
- Alpha hosted Storage policy query: PASS.
- Alpha production HTTP health check: PASS (200).
- Secret scan: PASS.
- Package boundary check: PASS.
- Registry validation: PASS.
- Focused Storage and route regression tests: 28 tests passed across 4 files.
- TypeScript build check: PASS.
- ESLint: PASS, 0 errors and 157 warnings.
- Alpha Vercel Git connection, Node `22.x`, Production Secret and Ready
  redeploy: PASS; current deployment `dpl_6so1Nnmvm4UwyekHsDoGV58hpp5L`.
- Hosted route checks: Materials, Suppliers after redeploy, Supplier Invoices,
  Organization Settings, Timesheets, QA and Variations load after their data
  windows complete; Claims and full drawing lifecycle remain open.
- Shared Master fixes in this pass: required Storage bucket/policy
  reconciliation is now a forward migration; manual supplier-invoice totals are
  editable in `NewSupplierInvoiceReviewPanel`; project quote worksheet routing
  falls back to validated quote opportunity lineage for converted projects.
- Focused regression tests after those fixes: 3 files, 26 tests passed.
- Hosted live mutations: opportunity note, worksheet cell and purchase-order
  create/edit/totals persistence PASS; PO PDF view opened, download capture not
  independently verified.

No full real-customer readiness claim is made from these checks.

## Phase 1X-A2 addendum — current evidence and disposition

### Hosted commissioning results

- GitHub access was repaired on the existing private repository by re-authenticating the Vercel account to `kiwidudedev` and connecting the existing `kiwidudedev/tradesstack-client-alpha` repository. No repository was recreated.
- The Hobby project remains on Vercel Hobby; no Pro subscription, provider change, custom DNS or paid add-on was made.
- The authoritative release toolchain remains Node `>=22.22.2 <23` with `.nvmrc` `22.22.2`. The Alpha Vercel project setting is now `22.x`.
- A connected-source production deployment is Ready at `dpl_6so1Nnmvm4UwyekHsDoGV58hpp5L`, sourced from Alpha `main` SHA `029d616a9f6db69b546bf0f3457b7399597364c2`.
- The hosted release delta was configuration/provenance-only; no arbitrary feature or fake migration was manufactured. The required Production-only server-secret redeploy reached Ready and restored the Suppliers route.
- Hosted opportunity creation and note persistence passed for `Alpha Synthetic Tender`.
- Hosted pricing worksheet creation/edit/persistence passed for worksheet `7dbb856e-3ab6-4ef4-b092-f5e6efb61ab8`; only the deterministic basic cell path was exercised, not the complete formula/material/handoff matrix.
- Hosted purchase-order creation/edit/totals persistence passed for `26001-PO-01` / `1ebb7246-abdb-4fcd-8bfc-396a68ae5742`; the PDF view opened as a blob tab, but a downloaded file was not independently captured.
- Hosted Materials, Supplier Invoices, Organization Settings and Timesheets routes returned usable UI. QA was subsequently rechecked after the initial loading window: a synthetic QA definition was promoted to Ready, a run was started, a required check/comment was saved, the run was completed, and final sign-off was persisted. A synthetic Payment Claim was also created, edited, reloaded and exported.
- Before the configuration redeploy, `/app/company/suppliers` returned HTTP 500 with Vercel runtime evidence `Missing Supabase service role environment variables`. Alpha SQL evidence showed no Xero connection, zero imported contacts, zero external links and zero sync jobs. After the Production Secret redeploy, the route loaded with zero suppliers and Xero remained OFF.
- The expanded route pass found Site Safety landing cards explicitly marked `Open placeholder` for safety plans, daily logs, hazards, incidents, toolbox talks, inductions and company safety; these are not commissionable workflows yet.
- The hosted project Variations register was initially observed during its loading window with `New Variation` disabled; after allowing the hosted data load to complete, the register rendered and a synthetic variation was created, edited and persisted with a NZ$250 line and NZ$287.50 total.
- The hosted project quote pricing-worksheet URL returned 404 for the existing quote, while the opportunity worksheet route worked. Source tracing showed the resolver required `project.source_opportunity_id` even when the validated canonical quote retained `originating_opportunity_id`; Master now falls back to that validated quote lineage. The hosted fix remains pending a new approved Alpha deployment.
- Local source-contract verification now passes for the project quote surface, legacy/deep route contract and quote-lineage fallback (18 tests across 3 files); this does not change the hosted verdict because Alpha still runs the earlier deployed SHA.
- Hosted quote status mutation changed synthetic `Q-26001-1` from Draft to Sent and correctly made it read-only. `Create Revision` then created successor `1975af83-76d3-ca8a-0eef-db032af2f8d6`, but its pricing-worksheet route also returned 404, confirming a deployed quote-revision route gap rather than a one-off invalid URL.
- Hosted PO status changed from Draft to Pending Approval, required explicit Save, and persisted after reload. This adds status evidence to the existing PO create/edit/totals proof.
- The hosted manual supplier-invoice flow created a synthetic supplier and a draft line, but the review panel exposed no editable subtotal/GST/total fields. Approval therefore refused the draft because the entered NZ$100 line total did not reconcile with the displayed NZ$0 totals. This is a shared UI defect; the Master fix adds those required editable summary fields without changing the existing extracted-PDF path. No invoice was created from the invalid draft.
- The hosted `/app/company/cost-codes` and `/app/company/cost-items/review` URLs are intentionally retired legacy paths and redirect to Settings > Integrations; they are not current active cost-code workflows. Active synthetic cost-item behavior is covered through the hosted Materials path.
- Hosted Materials now has a synthetic `Synthetic Gib Board` record with a NZ$25 initial supplier price and an explicit tax-review state; it persisted after the create flow. Hosted Payment Claims also created `26001-PC-01`, saved a 25% line-progress value and notes, and showed a Last saved confirmation. Submission, export, retention-specific mutation and Xero sync remain outside the representative proof.
- Hosted supplier edit persisted a synthetic website value after reload. Hosted Files opened the existing private PDF’s details panel and initiated authorized Download; the object remained private and the existing owner/anonymous/outsider denial evidence still holds.
- Hosted Organization Settings accepted a synthetic construction-context value, displayed `Organization Settings Saved`, and retained it after reload. This proves the owner settings mutation path without enabling any external integration; branding/logo and financial-setting mutations remain open.
- Hosted Files also created `Synthetic Commissioning Folder`, which was visible and persisted after a page reload. File versioning, archive/delete and recycle-bin recovery remain open.
- Hosted Files then accepted the synthetic `alpha-live-upload-proof.txt` through the real upload chooser. The queue reached `Completed`, and the file remained listed after closing the dialog with owner, Active state and Version 1 metadata. A download attempt for that new object was blocked by the local browser client at the signed Storage URL; the pre-existing synthetic PDF remains the authorized-retrieval proof.
- Submitting the Files search for `alpha-live-upload-proof.txt` returned only that uploaded object, proving the hosted register search path for the new file.
- Hosted Materials search also isolated `Synthetic Gib Board`; register search is therefore proven for Files and Materials, while full filter/sort/load-more coverage remains open.
- Current route recheck found the global `/app/trade-packs` and `/app/trade-packs/new` paths redirect to Opportunities, while `/app/projects/alpha-fictional-build/trade-packs` returns 404. After the approved existing-migration Storage repair restored `project-drawing-sets` and its three policies, the active Opportunity Generate Trade Pack path accepted synthetic `Payment-Claim-26001-PC-01.pdf`, generated a valid 1-of-1-page Preliminaries / General PDF, saved/indexed it, listed it after reload and offered owner Download. Site Safety subroutes such as Daily Logs load but explicitly show `Nothing tracked here yet`, describe the area as a placeholder, and expose a disabled `Coming soon` control.
- Current anonymous boundary checks returned `307 Location: /login` for `/app/dashboard` and `401 {"error":"Unauthorized."}` for `POST /api/projects/create`. The deployed manual Supplier Invoice review still exposes no subtotal, GST, or total inputs; it only shows read-only zero-valued summary text.
- The dedicated `/preconstruction/retention` path redirects to `preconstruction/claims#retention`; the retention ledger renders with zero balances and no retention-specific create control. This is a register-load proof only, not a retention document/reconciliation proof.
- Payment Claim and Variation PDF export controls were available and initiated for the synthetic records. Payment Claim export now has a locally verified PDF file; Variation/PO/QA/quote file content remains unverified.
- A subsequent hosted `Export Payment Claim` action produced `/Users/corey/Downloads/Payment-Claim-26001-PC-01 (1).pdf`; the local file command identified it as a valid PDF document. This verifies claim-file creation, but not semantic PDF text/content or the other document types.
- Hosted Users & Permissions currently shows only `Owner` and `Staff (0)`. The invite dialog exposes `Admin`, `QS`, `Project Manager` and `Worker` roles, but restricted-role checks were not fabricated through an invite because that path would use the explicitly excluded email integration; restricted-role authorization therefore remains unproven.
- Project and opportunity takeoff, drawings, drawing intelligence, change detection, and trade-pack routes generally loaded. The repaired Alpha Storage foundation now supports a persisted representative trade-pack object and owner reload/download; direct source drawing-set revision/render remains open because the worker/render path is intentionally excluded, and route load is not treated as workflow success.
- Alpha SQL verification confirmed `project_drawing_sets`, `trade_packs`, and `can_access_project_drawing_storage_object(text)` exist. With explicit authorization, the exact existing-migration Storage repair was executed; a follow-up read-only query returned the private `project-drawing-sets` bucket plus all three expected `storage.objects` policies.
- A broader read-only Alpha Storage inventory previously returned only `organization-documents`; the approved repair added only the required `project-drawing-sets` bucket and its policies for this commissioning path. Other source-defined private buckets for task attachments, QA evidence/photos, variation attachments, supplier invoices, retention documents and material imports remain unproven and were not created.
- Settings, Supplier Invoices, Materials, Suppliers and Timesheets pages loaded. The cost-code and cost-item review URLs are retired legacy redirects; the active trade-pack builder works through Opportunity drawing intelligence and its representative Alpha Storage persistence now passes. Remaining active replacement workflows remain individually open unless listed as a PASS above.

### A–CC acceptance disposition

| Item | Disposition |
|---|---|
| A — Alpha repository | PASS: existing private repo, owner namespace and main SHA verified |
| B — Vercel project | PASS: existing Hobby project preserved |
| C — Supabase project | PASS: dedicated Sydney Free/NANO project preserved |
| D — Node/runtime | PASS after setting project runtime to `22.x`; Ready redeploy verified |
| E — source provenance | PASS: Git-connected production deployment from Alpha main |
| F — Alpha configuration | PASS: client-config fingerprint retained |
| G — migration ledger | PASS through hosted `20260927100000`; exact-ID cleanup intentionally pending; reusable `20260927110000_reconcile_required_storage_buckets.sql` authored and locally validated, pending controlled Alpha release |
| H — Auth | PASS representative owner/outsider Auth users; credentials not reported |
| I — Storage privacy | PASS private bucket, authorized retrieval, anonymous/outsider denial |
| J — Files application upload | PASS: synthetic text file uploaded through the hosted chooser, listed and persisted; existing PDF also retained |
| K — organization isolation | PASS representative project and Storage cross-org denial |
| L — anonymous denial | PASS dashboard redirect and project API 401 |
| M — permission denial | PARTIAL: owner proof passed; restricted role matrix not provisioned |
| N — project workflow | PASS representative create/isolation; full delivery lifecycle open |
| O — task workflow | PASS representative mutation/persistence |
| P — QA workflow | PASS representative path: definition Ready, run started, required evidence/comment saved, completed and signed off; photo evidence not exercised |
| Q — CRM | PARTIAL: client route/read proof; full CRUD/search/notes matrix open |
| R — opportunities | PARTIAL: live create/note persistence; status/conversion open |
| S — worksheets | PARTIAL: basic live create/edit persistence; full commercial path open |
| T — quotes | PARTIAL: synthetic quote retained; complete revision/publication matrix open |
| U — variations | PASS representative path: synthetic variation created, line/title/notes saved and totals persisted; full lifecycle/export matrix open |
| V — purchase orders | PARTIAL: live create/edit/totals/PDF-view proof; full permissions/export open |
| W — suppliers/materials | PARTIAL: synthetic supplier create/detail persistence passed; edit/pricing matrix open |
| X — invoices/claims | PARTIAL/FAIL: Payment Claim create/edit/register/export-initiation proof passed; manual Supplier Invoice totals UI still blocks approval; retention-specific mutation and downloaded PDF content remain open |
| Y — takeoff | NOT COMMISSIONED: worker/render path intentionally OFF |
| Z — files/drawings | PASS representative Files; drawing-set lifecycle open |
| AA — timesheets/mobile | PARTIAL: browser Timesheets route loads; native/device contract open |
| AB — integrations/providers | PASS OFF-state: Xero, AI, email, worker, cron and DNS remain disconnected |
| AC — operations/rollback | PARTIAL: Vercel logs and redeploy path available; backups/Storage restore/RPO/RTO not proven |

### Secret, plan, backup and retention assessment

- Secret scan passed. No password, token, key, service-role value or database credential is included in this report.
- Alpha Vercel is Hobby; Alpha Supabase is Free/NANO in Sydney. Master remains separate and was not modified by this pass.
- The Alpha service-role value is stored only as a Vercel Production Secret; it is not in source, the browser bundle or the report. The newly required redeploy must complete before Suppliers can be re-tested.
- Managed database backup/PITR capability on Free/NANO and object-level Storage export/restore were not proven. Storage recovery remains a separate limitation from database recovery.
- Minimum observability is Vercel runtime/request logs plus Supabase health/log surfaces. No third-party monitoring provider was connected.
- Retain Alpha’s fictional records, Auth users and private Storage object as commissioning evidence until explicit cleanup approval. Cleanup must be a deliberate, documented operation and must not touch Master.

### Release, rollback and hardening

The release chain is Master source → approved release/provenance record → private
Alpha repository → Vercel Git-connected production deployment. The Alpha
repository currently remains clean at `029d616a9f6db69b546bf0f3457b7399597364c2`.
Master remains dirty at its pre-existing SHA `a9a7dc211abcf5f88c3192e05bfeecc3e8d3039d`; no Master commit or push was made.

Rollback is to the last Ready Vercel deployment or redeploy of the last known-good
Alpha SHA. It does not reverse database migrations. Database recovery requires an
approved forward migration or provider restore; Storage-object recovery requires
an independently retained object export. Before real-customer use, resolve the
Suppliers configuration defect, prove a complete clean release delta, complete
role/cross-organization negative testing, prove backups and Storage recovery,
complete commercial/QA/takeoff/PDF/export workflows, and define alert ownership.

## 2026-09-28 current audit addendum

This addendum records the latest read-only hosted audit. No Supabase SQL write,
migration application, record update, or fixture repair was performed during
this audit. The only hosted database-side change in this commissioning thread
remains the previously explicitly authorised Storage-policy repair.

### Hosted route evidence

The authenticated Alpha session loaded the following route shells without a
404 or anonymous redirect: the Alpha Synthetic Tender overview, Files, Scope
Builder, Pricing Worksheet and Quotation; Alpha Fictional Build overview,
Dashboard, Job Management, Tasks, QA, Files, Preconstruction, Quote, Purchase
Orders, Variations, Claims, Retention, Timesheets, Site Safety, Hazards and
Daily Logs; and company Supplier Invoices and Payment Claims.

These are route-load results, not claims that every route's mutation and
downstream persistence is complete. Site Safety subroutes visibly remain
placeholder surfaces. The hosted Payment Claims company register initially
showed its loading boundary, then rendered after the normal hosted load window
with the expected `No Payment Claims for this period` empty state. It is not
counted as a failure; no claim data was changed while observing it.

### Quote worksheet disposition

The project quote worksheet 404 is not being repaired by linking Alpha rows in
SQL. Read-only lineage inspection showed that `alpha-fictional-build` was a
manually created project with `source_opportunity_id` null, while the synthetic
opportunity has a separate, correctly linked tender workspace. Its two quote
rows likewise have no opportunity lineage. That is an invalid/unconverted
fixture relationship for this route, not evidence that authorization should be
weakened. The valid product path is the existing opportunity → accepted quote
→ controlled conversion flow, which establishes lineage through the existing
promotion RPCs. The Master fallback for older converted projects remains
covered by tests; no SQL data repair was applied to manufacture a pass.

### Local reusable validation

Master conversion and route contracts passed with the repository-supported
Vitest command: 5 test files and 26 tests passed, covering project quote route
ownership/lineage fallback, conversion response handling, opportunity
promotion contracts and opportunity creation. The invalid `--runInBand` flag
was rejected by this Vitest version and was not used in the successful run.

The current hosted evidence therefore remains **PARTIAL / NOT READY for real
customer production**. Open items include the older invalid quote fixture's
lineage (the valid conversion path is now proven), supplier-invoice document
matching/approval extensions,
full authorization matrix, cross-organization negative coverage across every
sensitive module, drawing/takeoff lifecycle, exports, backups/Storage
recovery, and the explicitly excluded provider paths.

### Reusable Master defect fixed

The source audit identified a generic defect in the legacy-compatible
opportunity creation fallback: it created the opportunity and tender workspace
but did not invoke the existing `sync_opportunity_tender_clients_v1` RPC. The
overview could therefore show a primary client while the quotation register
had no recipient row. Master now synchronizes the deduplicated tender-client
list, including the primary client, and cleans up through the existing path if
that synchronization fails. No migration was added and no historical
migration was edited.

Regression evidence: `lib/opportunity-creation-server.test.ts` passed 10/10;
the combined opportunity creation, conversion, project worksheet route and
promotion contract run passed 5 files / 27 tests. The fix remains local and
uncommitted in Master; the same source change was promoted to Alpha through
the existing controlled release path, and Master was not pushed.

Hosted proof after Alpha promotion `9cd9c21` / Vercel deployment
`dpl_H1L5TZG5wGj2oJvStUmX8oL9HGKy`: a new synthetic opportunity
`alpha-legacy-fallback-proof` was created through the application with
`Alpha Synthetic Client`. The Tender Client appeared in the Quotation
Register, a new quote `26002-1` was created and saved as Accepted, and the
existing application conversion flow created the project
`alpha-legacy-fallback-proof`. The project quote `Q-26002-1` loaded, its
project quote worksheet route returned the Pricing Worksheets surface instead
of 404, and the first project worksheet was created and persisted. This is the
controlled hosted proof of the reusable fix; the older manually created
`alpha-fictional-build` fixture remains intentionally unrepaired.

The Master worktree also passed `npm run build` after the fix: compilation,
TypeScript, page-data collection and static generation completed successfully.

Additional local contract coverage for the commissioned commercial surfaces
also passed: 10 test files / 89 tests covering Payment Claims registers and
migrations, Supplier Invoice workflow and browser-write regressions, project
quote routing/detail/pricing contracts, the opportunity quote register, and
worksheet mutations.

The same Alpha deployment also re-proved Supplier Invoices: the manual review
panel exposed editable Subtotal, GST and Total fields; synthetic invoice
`ALPHA-SI-26001` was approved for creation, created at NZ$115.00, appeared in
the hosted register as `Captured`, and remained present after a full page
reload. Its detail page retained the supplier, PO reference, dates, line,
totals and activity history. The earlier pre-fix “approval blocked by zero
totals” observation is superseded for the current release. PDF/document
matching and Xero remain open or intentionally off.

The converted-project Variation path was also re-proved: variation
`26004-VAR-01` (`83f00280-126a-4e9f-b606-6d09c24d09a6`) was created, assigned
the `Client Request` origin, given a NZ$250 line, moved to `Priced`, saved and
reloaded with its title, line, notes and NZ$287.50 inclusive total intact.
Full approval/invoicing/export and cross-organization negative coverage remain
open.

The converted-project Purchase Order path was also re-proved: `26004-PO-01`
(`26fe3526-8b58-404a-8de5-f148559f9b88`) was created with a NZ$400 line,
moved to `Pending Approval`, saved and reloaded with its title, line, notes and
NZ$460 inclusive total intact. PDF download and supplier-invoice allocation
remain open.

The converted-project Payment Claim path was also re-proved: `26004-PC-01`
(`6d7305b3-1a31-4ccc-9729-0a9c7d462baf`) was created against the accepted
quote, saved with 25% progress and notes, submitted, reloaded with its
Submitted state and NZ$258.75 payable total, and exported to the valid PDF
`/Users/corey/Downloads/Payment-Claim-26004-PC-01.pdf`. The page correctly
reported Xero readiness blockers; Xero was not connected.

The current local boundary, secret-scan guardrail and client-registry checks
also pass (`check:boundaries`, `ops:security`, `ops:registry`).

The converted-project QA path was then re-proved without database-console
interaction: `Converted project pre-start QA` was saved with a `Pre-start
checks` section and required `Site access and pre-start controls confirmed`
inspection check, promoted to Ready, and a hosted run
`808f0e5c-f13e-40b0-81bc-674001b775a4` was started with synthetic location and
reference values. The required check passed, its evidence comment persisted,
the run completed as read-only, and final sign-off persisted as `Synthetic
Owner`. Photo evidence and hold-point behavior remain intentionally unproven.

This audit made no Supabase SQL writes and added no migration. The only
hosted mutations in this pass were through the application workflows listed
above; the SQL editor was not used.

The converted-project Takeoff route also loaded successfully at
`/app/projects/alpha-legacy-fallback-proof/takeoff` and exposed the expected
Drawing Sets controls (`Choose File`, `Add Drawing Set`, and `Upload First
Drawing Set`). The browser automation surface did not emit a file chooser for
the hidden PDF input, so no drawing set was uploaded in this pass. Calibration,
measurement persistence, and drawing-set authorization therefore remain
unproven; `/takeoff/quantities` loaded and explicitly reported that no
drawing set was available, while `/takeoff/measure` redirected to the same
empty Drawing Sets surface. The render worker remains intentionally excluded.

Variation `26004-VAR-01` also exposed `Export PDF`. Activating it opened a
hosted blob PDF view, but no local download artifact was produced by the
browser harness. This is recorded as partial export evidence, not as a claim
of verified PDF file content.

The full hosted Site Safety route set was rechecked: `safety-plans`,
`daily-logs`, `hazards`, `incidents`, `inductions`, `toolbox-talks`, and
`company-safety` all loaded their named surfaces, but each reported `Nothing
tracked here yet` and exposed only a disabled `Start building here` or
`Coming soon` control. No Site Safety mutation or persistence proof is
possible until those product surfaces are implemented.

The hosted Timesheets route also loaded with range/trade/company/worker
filters, an empty register, totals, and a `Clock In` control. The latest
recheck confirmed that the control is present and enabled for the fictional
owner. Clock-in/clock-out persistence was not executed because the action
requests precise browser geolocation; accepting that permission would transmit
location data without separate authorization. The native/device contract
remains unproven. No worker or background execution was started.

The hosted Materials workflow was extended with a second synthetic supplier
price for `Synthetic Gib Board`: Alpha Synthetic Supplier at NZ$30 per sheet,
with `Save incomplete — needs tax review` and a synthetic review reason. The
detail view retained both the existing NZ$25 line and the new NZ$30 line after
reload. Supplier edit/search and tax-complete pricing remain open.

The adjacent Supplier register was also edited through the application:
`Alpha Synthetic Supplier` was set to `30 days after bill date`, and the
register retained that payment-term value after a full reload. Xero remained
unlinked and was not invoked.

The hosted CRM client surface was expanded as well. `Alpha Synthetic Client`
retained a newly selected `Good Client` tag after reloading its edit form, and
the client `Jobs`, `Quotes`, `Invoices`, `Files`, `Notes`, and `Timeline`
subroutes all loaded with their expected synthetic records or empty state.

A new note, `Synthetic CRM note persistence proof after full hosted workflow
audit`, was created through the client Notes surface and remained present after
a full reload.

The converted project Financials route also loaded as a read-only report and
rendered the accepted quote `Q-26002-1`, Current Budget NZ$1,000, Approved
Variations NZ$0, Committed NZ$0, Spent NZ$0, and Remaining NZ$1,000. It exposed
no mutation control; committed/posted spend impact from approved POs and
supplier invoices remains unproven.

The synthetic PO `26004-PO-01` was then transitioned from `Pending Approval`
to `Approved` through its hosted editor. After reload, Financials showed
NZ$400 committed and NZ$0 spent, confirming the approved-PO commitment path.
Supplier-invoice posting and actual-cost ledger impact remain unproven.

The synthetic variation `26004-VAR-01` was then transitioned from `Priced` to
`Approved`. Financials reloaded with NZ$250 Approved Variations, NZ$1,250
Current Budget, NZ$400 Committed, and NZ$0 Spent. This proves the hosted
approved-variation budget path alongside approved-PO commitments; supplier-
invoice posting and actual-cost ledger impact remain unproven.

The hosted company Payment Claims register loaded with period, client, status,
outstanding, overdue, and sort controls and listed submitted claim
`26004-PC-01` for `Alpha Synthetic Client` at NZ$258.75. The retention entry
point redirects to the Claims retention ledger, which currently shows NZ$25
current retention and submitted `26004-RC-01` linked to `26004-PC-01`. Its
detail page is read-only, shows locked immutable submission/allocation evidence,
and reports Xero `Not ready`; retention-specific create/edit/PDF/reconciliation
controls remain unavailable.

The Variation Pricing Worksheet path was also exercised: worksheet
`5bc94360-ee20-4be9-94cc-b5c5a5487cad` was created for `26004-VAR-01`, cell A1
was set to `Variation worksheet proof`, the workbook saved with a `Last saved`
confirmation, and the value remained after a full reload. AI controls were
not invoked.

The next supplier-invoice proof exposed a concrete matching defect. Manual
invoice `ALPHA-SI-26002` (`2ef4a029-e578-4ba9-abd1-0e5fa552429f`) was created
at NZ$460 with supplier reference `26004-PO-01`. The allocation dialog showed
the visible approved PO and accepted a NZ$460 draft match, but the save path
reported `Purchase Order Supplier mismatch`; after saving the invoice details
and retrying, the PO detail still reported `No Supplier Invoices have been
allocated`. This is recorded as a real application defect, not repaired with
SQL or a data-console bypass. Supplier-invoice posting and actual-cost ledger
impact therefore remain blocked by this matching defect.

Read-only source tracing confirms the failure is an authoritative-ID check in
the existing `set_supplier_invoice_purchase_order_match` path: it rejects
when `supplier_invoice.supplier_id` is null or differs from
`project_purchase_orders.supplier_id`, even when the UI labels are identical.
The hosted result therefore indicates a supplier-identity/data-integrity
defect or stale linkage, not a permission denial. The focused local migration,
purchase-order summary, invoice accounting-route, and supplier-price tests
still pass (4 files / 57 tests), so hosted reproduction remains necessary
evidence of the uncovered data path.

### Supplier-invoice matching resolution

The apparent hosted matching defect was then resolved through the normal
application workflow. The synthetic PO editor re-selected the canonical
`Alpha Synthetic Supplier` and saved it. The existing invoice match path then
confirmed `26004-PO-01`, allocated its NZ$400 invoice line, saved the draft
allocation, and retained `Allocated — 26004-PO-01` after a full invoice reload.
The team-review handoff was exercised and correctly required allocation before
review. No SQL, console bypass, migration, or client-specific code change was
used. The original failure is therefore classified as stale supplier identity
data exposed by the hosted fixture, with a valid application-level recovery
path proven; document upload and Xero remain open/off by scope.

Focused local contract evidence also passed for the unexercised Takeoff and
export branches: 8 Takeoff/measurement contract files with 44 tests, followed
by 6 payment-invoice-retention-claim/quantity-export files with 58 tests.
These strengthen the code-contract evidence but do not replace hosted
drawing-set and measurement proof.

## Latest shared-code validation

The current Master worktree was rechecked without touching Supabase or adding
SQL. The focused supplier-invoice suite passed 4 files / 57 tests. The broader
Files, Takeoff, QA, Payment Claims, Financials and export contract sweep passed
17 files / 68 tests, with one intentionally skipped test. The runnable
security, permission and Storage contract sweep passed 6 files / 48 tests,
with 35 intentionally skipped tests. Release typecheck and production build
also passed.

The separate document Storage integration suite was not counted as a product
failure: it could not initialize because this local environment has no
Supabase URL/service-role integration variables. Hosted Alpha Storage evidence
is recorded separately above. No Supabase SQL write, migration edit, or hosted
database change was made during this validation pass.

The full release-contract suite subsequently passed **690 test files / 4,619
tests**, with 5 files / 29 tests intentionally skipped. This is shared Master
contract evidence only; it does not convert hosted placeholders, missing role
fixtures, browser-permission blockers, or blob-URL inspection limits into
hosted passes.

The hosted QA Templates surface was also commissioned with synthetic data:
`Synthetic Prestart Template` was created, given `Synthetic Prestart Controls`
and a required `Synthetic pre-start controls confirmed` inspection check, saved,
promoted from Draft to Active, and reloaded with the active status and field
intact. Hosted Users & Permissions independently showed the Alpha owner as
Active/Owner with Staff (0) and no pending invites.

The project Files surface now has a synthetic hierarchy and recovery proof as
well. An empty folder was created, inspected, renamed to `Synthetic Project
Documents Renamed`, and moved into `Synthetic Archive Area`. A fresh root reload
showed only the destination folder, while direct destination navigation showed
the renamed folder inside it, proving the move persisted in both directions.
With explicit approval, the synthetic destination tree was deleted through the
application, appeared in Recycle Bin as a two-item deletion batch, and was
restored to the original Files-root hierarchy. The same hosted Files surface
also proved version creation: re-uploading the synthetic PDF with the same
name invoked the normal replace confirmation, and File Details reported active
Version 2. No non-synthetic files were deleted or purged.

### Latest approved hosted checks

The hosted Timesheets workflow requested browser location permission; this was
explicitly approved for the synthetic Alpha test. The owner clocked in, the
active row and On Site Now count appeared, then clocked out. The finished row
persisted with worker, date, clock-in, clock-out, duration and Finished status
after the mutation. Native/mobile/Edge contracts remain outside this web proof.

The hosted Takeoff workflow accepted
`Payment-Claim-26004-PC-01.pdf` through the application upload flow. After a
reload the drawing set remained listed as `Preparing`; opening it entered the
Measure state that explicitly says it is queued and waiting for a worker. This
proves application upload and private persistence. Calibration and measurement
proof is deferred because the Takeoff worker is intentionally OFF; no worker,
cron, AI, Xero, email, or other excluded integration was enabled.

Site Safety remains deliberately deferred. Its routes are placeholder-only and
the user explicitly approved leaving that area unimplemented for this audit.
No SQL, migration, Master cloud resource, or Site Safety product behavior was
changed.

The hosted Files version path is also now proven. `Payment-Claim-26004-PC-01.pdf`
was uploaded to Files root, uploaded again with the same name, and the normal
application confirmation asked whether to replace it with a new version. After
confirmation, both uploads completed and File Details reported Version `2`,
`active`, in Files root. No direct database or Storage-console operation was
used.

The repository contains responsive Playwright coverage, including 390x844
payment-claim and Takeoff cases. A targeted local run could not initialize
because `LOCAL_E2E_OWNER_PASSWORD` is not present in the current environment;
this is recorded as a test-environment blocker, not a hosted responsive pass.

### Latest shared release recheck

The current worktree was revalidated after the hosted checks. Release lint
completed with zero errors and 156 existing warnings. Authoritative local
release validation passed all gates: toolchain, release lint, release tests,
TypeScript, release identity, registry, migration preflight, security and
drift. Migration repository preflight also passed; it inspected repository
metadata only and did not inspect or mutate the hosted database. No SQL file
was added or modified during this audit turn.

The hosted Purchase Order export was rechecked through Chrome's PDF/print
viewer. The visible one-page document content was readable and matched the
synthetic record: Alpha Synthetic Supplier, PO `26004-PO-01`, date/type,
project Alpha Legacy Fallback Proof, Synthetic acoustic materials, NZ$400
subtotal, 15% GST and NZ$460 total.

The Variation export was then verified through the same PDF/print viewer. Its
one-page content matched the synthetic record: Alpha-owner organization,
Variation `26004-VAR-01`, Client Request, Approved, Additional acoustic lining,
NZ$250 subtotal, 15% GST and NZ$287.50 total.

The converted project Quote export was then verified through the hosted
PDF/print viewer. Its one-page content matched `Q-26002-1`, Alpha Synthetic
Client, Alpha Legacy Fallback Proof, Synthetic preliminaries labour, NZ$1,000
subtotal, 15% GST and NZ$1,150 total.

The hosted QA register, QA definition detail, and completed read-only QA record
were inspected afterward. They expose configuration, Start QA, Edit QA, record
view and sign-off evidence, but no QA Export PDF or document-generation control
is present. QA export is therefore recorded as not exposed by the current
product surface, not as an unverified successful export.

The shared authorization/security contract sweep was rerun after the hosted
checks: 2 test files passed with 12 tests passed; 1 intentionally skipped file
contained 5 skipped tests. These are reusable Master-code permission and
security contracts, not a substitute for hosted restricted-role provisioning,
which remains unproven because the Alpha member surface has no role fixtures
and email delivery is excluded.

An unauthenticated production smoke check was also rerun without credentials:
the public root returned HTTP 200; protected Dashboard, Files and QA routes
returned HTTP 307 to `/login`; and anonymous `POST /api/projects/create`
returned HTTP 401 `Unauthorized.` No credential or secret was printed.

### Historical audit reconciliation before Phase 1X-A3

The following two gaps were the recorded pre-Phase-1X-A3 blockers. They are
retained as historical evidence; the Phase 1X-A3 addendum below supersedes
their current status where new proof exists:

1. Restricted-role authorization and the complete role matrix cannot be
   completed with the current Alpha state because Users & Permissions contains
   only the fictional owner. The visible provisioning path is an email invite,
   and email is explicitly excluded. Required human action: provide or
   authorize a non-email synthetic role-fixture path and test identities.
2. Responsive/mobile verification cannot initialize the existing viewport
   Playwright suites because `LOCAL_E2E_OWNER_PASSWORD` is absent from the
   local test environment. Required human action: populate that credential
   through the approved secret-management path without exposing it.

Takeoff being queued is expected while Worker is OFF; QA export is not exposed
by the current QA surface; Site Safety is deferred by explicit approval; and
Xero, AI, cron, email, custom DNS and other excluded integrations remain OFF.
No SQL, migrations, Master cloud resources or provider connections were changed
during this audit.

## Phase 1X-A3 closeout addendum

The restricted-role blocker is resolved without email delivery. The source role
model is the existing `owner`, `admin`, `qs`, `project_manager`, and `worker`
model in `20260406183000_add_role_permissions_foundation.sql`. Four fictional
Alpha-only Auth users were created through the Supabase Auth dashboard with
auto-confirm enabled, then assigned to the existing Alpha organization through
the legitimate `organization_members` model in the Alpha Table Editor. No
invitation or email was sent, and no password or credential is recorded here.

Hosted browser proof at 390x844 established the following representative role
matrix:

- Admin: same-organization Files access allowed; Users & Permissions redirected
  to Organization Settings and the controls were disabled with an explicit
  permission message.
- QS: same-organization Variations access allowed; Users & Permissions denied
  in the same server-backed manner.
- Project manager: dashboard/project shell access allowed; Users & Permissions
  denied in the same server-backed manner.
- Worker: Tasks loaded with the normal Add Task/project controls; Users &
  Permissions denied in the same server-backed manner.
- The existing outsider and anonymous proofs remain valid: cross-organization
  project/Files/private-Storage access is denied, protected routes redirect to
  login, project creation returns 401, and private Storage is not public.

The hosted responsive pass covered Dashboard, Tasks, QA, Files, Takeoff,
Timesheets and Payment Claims at 390x844. Each surface loaded with usable
navigation and primary controls. After clearing the console and reloading the
Payment Claims surface, the fresh browser console contained zero messages.
Takeoff remained in the expected Preparing/worker-off boundary.

The local browser suite was rerun with the approved Keychain secret lookup.
The affected opportunity Files workflow, project Files continuity, Takeoff,
pricing worksheet, and Payment/Retention visual cases pass in isolation; the
authoritative release suite also passes 4,619 tests. A serial 33-case E2E run
had one 90-second opportunity-menu timeout after 5.5 minutes, while its
isolated retry passed after the shared menu-readiness correction. Non-blocking
local warnings remain for an existing OperationalPanel class mismatch, image
aspect-ratio warning, and missing Dialog descriptions; no nested-button
hydration error remains in the corrected retention flows.

The generic retention/file-menu/dialog and compatibility fixes were promoted
through Master at product commit `4fbdca2b`, recorded in release
`0.0.0-phase1vr.local`, and applied through the controlled Alpha upgrade. Alpha
main is now `774ebad24f3c7675d6fde8eed9931243eaec7e93`; the READY production
deployment is `dpl_8Lx2JyRDZWod9XGara7vftp1ojjF`. The upgrade preserved the
client configuration, synthetic database/Auth/Storage evidence, and private
Storage boundary. Production returned HTTP 200, anonymous dashboard access
redirected to login, and the authenticated hosted dashboard loaded in Chrome.

The deployment initially exposed a generic Hobby incompatibility: Master still
listed per-minute Vercel cron schedules even though cron was approved OFF. The
fix removed the cron definitions from `vercel.json`, was validated and pushed
to Master, then redeployed successfully without Vercel Pro. The old manually
created quote fixture with no source lineage remains retained synthetic stale
data; the supported converted-project route and worksheet flow pass, so this is
not treated as an active product failure. Vercel remains Hobby and Supabase
remains Free/NANO in Sydney. Backup restore is not verified on the Free tier;
observability is limited to Vercel and Supabase provider logs; the fictional
Alpha retention/cleanup plan requires explicit approval before removal.

### Phase 1X-A3 verdict

YES — COMPLETE HOSTED TRADESSTACK PRODUCT COMMISSIONED WITH APPROVED EXCLUSIONS

The approved active hosted scope is commissioned. The stale legacy fixture is
retained as synthetic data because repairing it would require inventing source
lineage; it does not block the supported workflow. Real-customer status remains
**NOT READY — PHASE 1X-B PRODUCTION HARDENING REMAINS**.

### Phase 1X-A3 responsive correction

The owner-provided Chrome iPhone SE capture at 375x667 exposed a genuine
dashboard overflow: the hero summary was forced to remain on one line and the
hero flex child could not shrink. This was corrected generically in Master by
allowing the hero content to shrink, wrapping the summary text, and preserving
safe word breaking in `app/app/(workspace)/dashboard/dashboard.module.css`.

The fix was validated through the existing Master release gates, promoted at
product commit `50af0967fd892c7a16ddd21bb81b724c1a522bf0`, copied into Alpha at
commit `657c6df7aa0f18002eebc98f1bf6e9533afa5f46`, and deployed as READY
production deployment `dpl_pzkREWV2XHBnjQyR5iGvZutQMQe7`. The deployed Alpha
dashboard loaded with the existing fictional authenticated data; Alpha
configuration, database records, Auth users, private Storage objects, and
authorization boundaries were not changed. Vercel remains Hobby, Supabase
remains Free/NANO, and all previously excluded integrations remain OFF.

### Phase 1X-A3 opportunity visibility correction

The owner reported that an opportunity created under `corey@metroci.co.nz`
was visible through the Client detail quote route but missing from the
Opportunities page. The cause was a generic page-filter defect: active pipeline
rows were only included in “Upcoming Quotes” when `due_date` was non-null.
New opportunities without a due date were therefore silently hidden even
though the underlying Alpha records and quote linkage were present.

Master commit `8b471160f0bf339ca4f94c347b8f2725f5b1e074` removes that incorrect
due-date requirement while preserving Lost/Won and submitted-quote tab
semantics. The fix was applied to Alpha at commit
`377f0f09630d383690ef6916e24d931545ea7ffa`, deployed as READY production
deployment `dpl_5moVVqmJWb1DSzsnoQSFgkRjKisy`, and verified in the live browser:
the active Opportunities page now shows `NP Control Tower`, `Clelands
Construction`, and quote `26001 · Original`. No database, migration, or
Supabase data change was required.
