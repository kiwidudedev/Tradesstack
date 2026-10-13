# TradesStack Phase 1Y-D — Provider-Independent Hosted Workflow Proof

## Status

**IN PROGRESS — CORE HOSTED WORKFLOW COMMISSIONING CONTINUES.**

The synthetic Alpha QA definition/run/sign-off path is now proven. Broader
Customer #1 workflow coverage remains open, and deferred provider/cost gates
remain explicit.

This pass continues production-capability work without activating email,
Supabase Auth SMTP, DNS, Xero, AI providers or Vercel cron.

## Scope completed in this pass

The authenticated Alpha owner session opened:

`/app/projects/np-control-tower/financials`

The hosted surface rendered the existing synthetic project financials and
expanded a budget-area detail row. The observed values were:

- accepted baseline quote `Q-26001-1`;
- current budget `$4,290.97`;
- original budget `$2,822.99`;
- approved variations `$1,467.98`;
- committed `$0.00`;
- spent `$0.00`;
- remaining/overrun `$4,290.97`;
- approved variation detail for `13mm Plasterboard Linings`, quantity `100`,
  unit `M2`, rate `$12.77`, total `$1,276.50`;
- source link to variation `26002-VAR-01`.

From that source-linked variation, the authenticated owner opened the
variation detail and selected its existing `Export PDF` control. Chrome
created a separate PDF blob tab titled `corey Organization - NP Control Tower -
26002-VAR-01`. This proves the hosted export path reached a generated PDF
artifact for a real persisted synthetic variation; the browser automation
surface does not expose blob-tab bytes for checksum/content inspection, so the
artifact is recorded as **generated, content verification pending** rather than
as a complete document-acceptance pass.

This was a read-only hosted observation. No database, Storage, Auth,
permission, provider or application state was changed.

The corresponding local release-config contract gate passed: 9 test files and
58 tests covering the financial summary/report, financial routing, purchase-
order presentation, variation UI contracts, and invoice/payment-claim/
retention export utilities.

The repository-wide release validation also passed, including release lint,
release tests, TypeScript, release identity, registry, migration preflight,
security and drift checks. Package-boundary enforcement passed. These are local
release gates only and do not replace hosted provider or customer-workflow
acceptance.

The apparent hosted reports route `/app/reports/cost-items/review` was also
checked. It redirects to the current Settings → Integrations surface, matching
the repository's legacy-route behavior. It is therefore not counted as a
missing active report workflow or as a false export pass. Active financial and
commercial read/export surfaces remain the relevant Phase 1Y-D scope.

## Provider-independent Alpha availability signal

The private Alpha repository now contains
`.github/workflows/client-alpha-production-health.yml`. It is deliberately
narrow:

- manual dispatch plus a fifteen-minute GitHub schedule;
- public Alpha root request only;
- bounded curl timeout/retry and non-empty HTML validation;
- no application, database, Supabase, provider or secret access;
- `contents: read` workflow permission;
- concurrency cancellation for stale checks.

Controlled run `37059233432` completed successfully on Alpha commit
`7338ecb8336c3965d461a2758783289a0c72d9bc`. The workflow's public-root check
and HTML validation both passed, and an independent post-run request returned
HTTP 200 with a non-empty response. This proves a minimum owner-operated
availability signal using existing/free GitHub capability. It does not prove
authenticated workflow health, database health, backup health, or 24/7
incident response.

The monitor was then extended with an `actions: read` check that reads only
GitHub Actions run metadata and fails when the latest successful encrypted
backup is older than 24 hours. Controlled run `37059522407` passed both the
public-root check and the backup-freshness check; the latest successful backup
run observed was `36977001303`. No backup artifact, key or database content was
read by the monitor.

After the Alpha deployment and schedule-offset changes, manual health run
`37062335822` also passed public-root, HTML and backup-freshness checks on
commit `6fadad166b9a47ec0c2cda9a8567e6b064318396`. This is a regression-free
manual health result; it does not convert the absent scheduled events into a
scheduled-monitor proof.

## Current Alpha Takeoff worker proof

The earlier synthetic worker proof was not treated as proof for every
customer drawing. The authenticated Alpha owner session later opened the
Measure route for drawing set
`589bd0b1-1ca9-426a-9927-c98f58edf043` and initially remained queued before
timing out. A bounded manual dispatch of the existing Alpha Takeoff worker
(`37059919697`) then completed successfully. Reloading the same hosted route
produced the Measure Workspace with the source PDF rendered on the canvas,
the Select/Calibrate/Count controls, navigation controls and the empty
takeoff summary. This is a current-drawing end-to-end worker/render proof,
not merely an HTTP health response.

The timeout is classified as a queued-job scheduling delay rather than a
renderer failure. The manual dispatch was an operational intervention for
this proof; recurring scheduled-worker coverage remains a separate operational
question and is not inferred from this run.

On 2026-10-02 20:50 UTC, the same deployed Alpha route was re-opened after
the worker-cadence fix. The hosted DOM reached the Measure Workspace with the
saved `Wall` measurement on Page 2 (`1.57 m²`), Select/Calibrate/Count controls,
zoom controls and page navigation. This is a fresh regression check of the
deployed route; it does not change the separate scheduled-worker classification.

### Current hosted Takeoff upload observation

During a later synthetic Alpha drawing upload observation, the hosted surface
briefly reported `Drawing uploaded, but metadata could not be saved`. A fresh
read then showed a second persisted drawing-set row for the uploaded PDF with
status `Preparing`, so the metadata did persist. The current client upload
implementation uploads the private Storage object first and then inserts
`project_drawing_sets`; on insert failure it attempts to remove the object
(`lib/project-drawing-set-upload.ts`). The transient alert is therefore not
currently reproducible from the post-reload state, but it remains worth
investigating because the UI message conflicts with the persisted row.

The upload/persistence portion is **PROVEN** for this synthetic owner path.
The controlled existing Alpha Takeoff worker was then manually dispatched as
GitHub Actions run `37068053342`; it completed successfully in 30 seconds.
Reloading the same drawing opened the Measure Workspace with a rendered page,
page navigation, Select/Calibrate/Count controls and the empty takeoff
summary. This closes the synthetic upload → queue → worker → preview path.
Recurring scheduling remains separately classified as
**DEFERRED — IMPLEMENTATION COMPLETE; HOSTED VERCEL PRO CRON PROOF PENDING
OWNER ACTIVATION**. No destructive retry or cleanup was performed.

The hosted alert remains a reliability finding even though the row later
appeared. The current implementation in `lib/project-drawing-set-upload.ts`
uploads the private object first, then performs the drawing-set insert and
throws the metadata error whenever the insert response is an error or has no
returned row. Because the hosted row was subsequently visible, the observed
failure may represent an ambiguous post-commit response rather than a failed
insert. A retry could therefore risk a duplicate drawing/object unless the
operation is made response- and idempotency-safe. This is **NOT PROVEN SAFE
FOR CUSTOMER #1 RETRY/RECOVERY**. A narrow local hardening change now
re-reads by the unique Storage path before cleanup when the insert response is
ambiguous, returning the committed row when it exists and avoiding accidental
object deletion. Focused tests cover this recovery path. A fresh hosted upload
has not yet been re-run, so the hosted alert-to-recovery behavior remains
**LOCALLY CHARACTERIZED; HOSTED RECHECK PENDING**.

## Synthetic Alpha QA definition, inspection and sign-off proof

The authenticated fictional Alpha owner safely created a new synthetic QA
definition for `NP Control Tower` and exercised the persisted lifecycle:

1. Created `Synthetic QA Proof` from the blank-definition path.
2. Added the `Site Inspection` section.
3. Added a required `Concrete inspection` check with instructions.
4. Saved the definition and advanced it to `Ready`.
5. Started a QA run with synthetic location/reference metadata.
6. Recorded a `Pass` response and a persisted commissioning comment.
7. Completed the run; the record became read-only with `1 / 1 Saved`.
8. Recorded final sign-off with an explicit synthetic owner attestation.

The hosted record route was:

`/app/projects/np-control-tower/job-management/quality-assurance/eb3c1767-b1df-45cd-ba42-87ac82795877/records/5b6bc13a-219b-4fc8-98dc-c48d2f51b885`

This is **PROVEN** for a synthetic owner-authorized QA definition → response →
completion → sign-off path. It does not yet prove photo/file evidence upload,
hold-point release, cross-role permission denial, or a second organization.
Those remain **PARTIALLY PROVEN / NOT PROVEN** as applicable and were not
papered over by the synthetic run.

The owner then created a separate synthetic QA issue, `Synthetic QA Defect
Proof`, with notes, trade and location metadata. The issue persisted in the QA
Issues tab and was advanced through `Open` → `In Progress` → `Complete` →
`Verified`. The issue detail activity recorded the status changes, and the
open-issue counter returned to zero after verification. This is **PROVEN** for
owner-context issue creation, persistence, activity/status progression and
verification. Issue photos, comments, linked task creation, cross-role
authorization and notification delivery remain unproven.

The later QA Issues-tab re-check showed `No issues yet`, while the Tasks Done
filter still displayed the automatically linked `Synthetic QA Defect Proof`
task. The issue was therefore proven during the original authenticated session
but is not currently proven as durably listable after leaving and returning to
the QA surface. The hosted classification is revised to **PARTIALLY PROVEN**
for issue persistence/readback pending resolution of the read-path inconsistency;
no replacement issue was created.

The current source and migrations do not show an intentional cleanup rule that
deletes Verified issues; the related trigger synchronizes or removes the
linked task when an issue is deleted, not the issue itself. The discrepancy is
therefore an unresolved hosted persistence/read-path finding rather than an
expected Verified-state behavior.

### QA issue read-path recheck after Alpha release

After the controlled Alpha QA relationship deployments, the authenticated
owner reopened Existing QA Activity and selected the Issues tab. The persisted
`Synthetic QA Defect Proof` was present with status `Verified`, `0 photos`,
trade/area `General / NP Control Tower`, and no open-issue count. This clears
the earlier hosted list-read inconsistency for the existing owner path. It
does not prove issue photo evidence, cross-role authorization, notification
delivery or all issue mutation paths. The current owner-path classification is
therefore **PROVEN** for issue readback after verification, with those
separate gates still open.

The existing QA Activity surface also displayed a hosted relationship error:
`Could not embed because more than one relationship was found for
'project_quality_work_proofs' and 'project_quality_work_proof_checklist_items'`.

Source tracing shows why this can make the Issues tab appear empty: the page
clears its QA state on mount, then `listQualityCoreData` loads work proofs and
issues in one `Promise.all`; if the work-proof relationship query fails, the
shared load rejects before `setIssues` runs. This is an implementation-level
explanation consistent with the hosted observation, not proof that the issue
row was deleted. The explicit relationship fix remains pending hosted
deployment.
This is recorded as an **ACTUAL PRODUCT DEFECT** affecting that activity/read
surface, not treated as a provider or commissioning deferral. A narrow local
fix now qualifies the existing direct `work_proof_id` relationship in
`lib/quality-assurance/queries.ts`; a focused regression test passes. No
database/schema change was made, and the hosted Alpha re-check remains
pending deployment of that fix.

## Synthetic Alpha task workflow proof

The authenticated Alpha owner also created the synthetic task
`Synthetic commissioning follow-up` in `NP Control Tower`, assigned it to the
owner, and verified the persisted status transition from `To Do` to `In
Progress`. The task appeared in the project task table and in the project
dashboard activity feed as a live task update.

This is **PROVEN** for task creation, assignment and a basic status update in
the owner context. Completion/closure, issue/defect linkage, cross-role
authorization and notification delivery remain separate evidence items.

The same synthetic task was then moved to `Done`, reloaded, and located again
through the hosted `Done` status filter. This extends the evidence to
**PROVEN** for owner-context task completion/persistence. Issue/defect linkage,
cross-role authorization and notification delivery remain unproven.

### Current task-state reconciliation

A later read-only reload initially showed `No tasks yet` with the default
active-task view. Selecting the explicit `Done` status filter then displayed
the persisted completed task set, including the newly created
`Synthetic Customer 1 Task Proof`, the earlier `Synthetic Customer One Task
Proof`, the QA issue's automatically linked `Synthetic QA Defect Proof` task,
and the earlier synthetic commissioning task. The new task was verified
through `To Do` → `Done` and remained present after reload. This is
**PROVEN** for owner-context task creation, assignment, status progression,
persistence and QA issue auto-task linkage. The default view's exclusion of
completed tasks is recorded as current UI filter behavior, not treated as data
loss.
The default view's exclusion of completed tasks is recorded as current UI
filter behavior, not treated as data loss. Cross-role authorization and
notification delivery remain unproven.

## Synthetic Alpha supplier workflow proof

The authenticated Alpha owner created a synthetic supplier named
`Synthetic Commissioning Supplier` with a legal name, contact identity,
synthetic email, country `NZ`, Active status and structured payment terms of
30 days after bill date. The hosted detail view persisted and displayed those
values, while the Xero section correctly remained unlinked and explicitly
reported that Xero connection is required for provider linking.

This is **PROVEN** for provider-neutral supplier creation, persistence,
structured payment-term handling and the separation between internal Supplier
identity and Xero identity. Xero OAuth, contact synchronization, supplier
invoice export and accounting mapping remain **DEFERRED — PROVIDER
ACTIVATION REQUIRED**.

## Alpha Materials/Supplier read-model proof

The hosted Alpha Material Library then showed the existing active material
`13mm GIB Standard Plasterboard` with unit `m2`, preferred supplier `Trade
Direct`, best cost `$12.77`, one supplier pricing row at `$11.10`, and the
material's persisted update date. The read model also exposed the separate
supplier-price value and preferred-status semantics.

This is **PROVEN** for the existing Materials → Supplier pricing read model
in the owner context. It does not prove price-list import, price-history
mutation, tax semantics, takeoff/commercial write-through or cross-tenant
authorization; those remain separate evidence gates.

## Alpha quotation continuity proof

The authenticated Alpha owner opened the persisted accepted quotation
`Q-26001-1` for `NP Control Tower`. The hosted detail view showed its Accepted
status, client/project context, expiry, three persisted line items, quantities,
units, rates, totals, terms/clarifications, and the source link back to the
pricing worksheet for the generated item. The displayed subtotal was
`NZ$2,822.99` excluding GST.

This is **PROVEN** for an existing accepted-quote → persisted line-item/source
continuity read path. It does not prove quote creation, revision creation,
publication, recipient delivery, or conversion behavior; those remain separate
workflow gates.

The same accepted quotation detail opened its existing `Export PDF` action and
created a hosted PDF blob tab. Its linked variation pricing worksheet also
loaded the saved sheet state, including the persisted material row `13mm
Plasterboard Linings`, rate `$12.77`, quantity `100` and total `$1,276.50`.
This extends the evidence to **PROVEN** for persisted pricing-sheet readback
and quote PDF generation. PDF byte/content inspection and recipient delivery
remain unproven; email delivery remains deferred.

## Alpha procurement and payment-claim read-model proof

The hosted Company → Suppliers register currently shows two active synthetic
suppliers, including payment-term/contact/address readiness fields and an
explicit `Unlinked` Xero state. The hosted Company → Materials library shows
the persisted `13mm GIB Standard Plasterboard` item, preferred supplier, unit,
price and active status. These are **PROVEN** for provider-independent
supplier/material readback; Xero linking and synchronization remain deferred.

The Materials `Import Supplier Price List` flow also loads safely and enforces
the required supplier/file prerequisites before enabling Import. Alpha had no
additional source price-list file available, so import parsing, review,
approval and persistence remain **NOT PROVEN**; no replacement fixture was
created merely to fill that gap.

The hosted Alpha Purchase Orders surface showed two persisted records: a
supplier-linked draft PO for `13mm Standard GIB — 100 m²` with Trade Direct at
`$1,110.00` excl. GST, plus a separate zero-value draft. The register total
matched the supplier-linked PO value.

The hosted Payment Claim surface showed submitted claim `26002-PC-01` at
`$3,555.76`, project totals, and a separate retention ledger showing current
retention of `$355.58`, paid `$0.00`, and outstanding `$355.58`. Both claim and
retention rows explicitly remained `Not synced` to Xero.

The claim detail then loaded the persisted quote and approved-variation source
lines, including the existing accepted quote value, the approved variation
value, claim percentages, retention held to date, GST and total payable. The
linked retention detail remained submitted with claimed `$355.58`, paid
`$0.00`, and outstanding `$355.58`. This is **PROVEN** for hosted owner
readback of payment-claim calculation, commercial lineage and retention-ledger
continuity. It does not prove paid-state reconciliation, customer delivery,
or Xero synchronization.

These are **PROVEN** as hosted persisted read-model and reconciliation
observations for the existing synthetic Alpha records. They do not prove new
PO/claim creation, approval transitions, payment allocation, or Xero
synchronization; those write/provider gates remain separate.

The persisted `26002-PO-01` record was then opened in its detail workspace.
The owner path displayed the supplier, material line, quantity `100`, unit
price `11.10`, subtotal `$1,110.00`, GST `15%`, total `$1,276.50`, Draft status,
and the empty supplier-invoice allocation panel. Its existing `Export PDF`
action opened a generated PDF blob tab titled for `26002-PO-01`. This is
**PROVEN** for persisted purchase-order detail continuity and hosted PDF
generation; PDF byte/content inspection, approval/issue/receipt transitions
and accounting synchronization remain unproven or deferred.

## Alpha supplier-invoice surface observation

The authenticated Alpha owner opened the organization Supplier Invoices
surface. The register loaded its lifecycle filters (`Captured`, `Needs Review`,
`Partially Approved`, `Approved`, and `Disputed`) and the `New Supplier
Invoice` entry point, but the current Alpha environment contained no supplier
invoice rows. No provider fixture or synthetic invoice was created merely to
fill the evidence gap.

At this initial read-only observation, supplier-invoice capture, extraction,
review, approval, allocation/matching and accounting synchronization were not
yet evidenced in hosted Alpha. The subsequent synthetic capture/allocation
evidence below supersedes that initial state for the covered paths; document
extraction, team approval, accounting synchronization and Xero-dependent
portions remain **NOT PROVEN / DEFERRED — PROVIDER ACTIVATION REQUIRED**.

### Synthetic supplier-invoice capture and allocation guard

Because the workflow is internal and provider-independent, a clearly synthetic
manual invoice was created for the existing synthetic supplier:
`SYNTH-INV-001`, dated 3 October 2026, due 2 November 2026, with one synthetic
line and a total of `NZ$110.00`. The review batch required the supplier,
invoice dates and reconciled totals before approval, then created the persisted
invoice record in `Captured` status. The detail view and activity log confirmed
the record and its manual source.

The invoice referenced `26002-PO-01`, but that PO belongs to `Trade Direct`
while the invoice belongs to `Synthetic Commissioning Supplier`. The hosted
allocation workflow surfaced `Purchase Order Supplier mismatch` and did not
silently match the invoice to the unrelated supplier. This is **PROVEN** for
synthetic capture, review approval, persistence and supplier-mismatch
allocation protection. Correct same-supplier allocation, team approval,
actual-cost posting and Xero synchronization remain unproven/deferred; no
provider fixture was created.

As a bounded follow-up, the synthetic invoice supplier was changed to the
existing `Trade Direct` supplier. The matching workflow recognized
`26002-PO-01` as a **Same supplier** candidate, and the separate invoice-line
allocation step then showed `This Invoice NZ$110.00` before confirmation. After
confirmation, the detail view persisted the line as `Allocated`, linked it to
`26002-PO-01` / `13mm standard GIB`, displayed `Invoice line · NZ$110.00`, and
recorded the allocation activity. This is **PROVEN** for same-supplier PO
matching and invoice-line allocation. The earlier full-PO `NZ$1,110.00`
remaining value was the PO balance before this invoice allocation, not an
allocation-total defect.

Team approval, actual-cost posting and Xero synchronization remain
unproven/deferred. The hosted team-approval action correctly refused to advance
the invoice because the draft allocation still required routing, accounting
and tax coding resolution. This is **PARTIAL — ALLOCATION PROVEN, APPROVAL
GATE CORRECTLY BLOCKED BY UNRESOLVED ACCOUNTING/TAX CONFIGURATION**; no
provider fixture or Xero action was attempted.

## Alpha tenancy and permission surface observation

### Hosted Financials classification observation

The hosted Financials report currently shows the accepted quote total
(`$2,822.99`) and approved variation total (`$1,467.98`) as expected, for a
current budget of `$4,290.97`. It also shows the synthetic quote/variation
line under `Unclassified` at `$1,276.50` and a separate `Commercial
adjustments` reconciliation row at `$3,014.47`; committed and posted actual
costs remain `$0.00`.

Source tracing confirms this is the current report design rather than an
unexplained hidden bucket: quote/variation/cost lines are grouped by
TradesStack cost-code and accounting-mapping metadata, while any portion of
the current budget not represented by classified rows is deliberately emitted
as a `__budget_adjustments__` row labelled `Commercial adjustments`. The
synthetic Alpha records do not contain the cost-code/accounting metadata needed
to classify their full commercial totals. Therefore this is **PARTIALLY
PROVEN**, not a newly confirmed arithmetic defect: the read model and
reconciliation guard are visible, but cost-code classification and posted
spend reconciliation require a properly coded purchase-order/invoice path.
No financial mutation was made merely to remove the reconciliation row.

### Hosted project identity/read-model inconsistency

The hosted Projects register linked `NP Control Tower` to `Clelands
Construction` and showed the project in `Pricing`. The project dashboard for
the same slug rendered client `Russell` while retaining the same quote,
variation and submitted-claim activity. This is a **PARTIAL / PRODUCT DEFECT
FINDING**: the project/opportunity/commercial continuity cannot be treated as
fully proven until the authoritative client and project-stage read path is
reconciled. No mutation was made to correct the discrepancy.

Source tracing confirmed that the dashboard aggregate RPC used the contact
`organization_clients.name`, while the Projects register used
`company_name`. The fallback loader had the same defect. The application
fallback is now corrected, and a forward migration
`20261003120000_fix_project_dashboard_client_identity.sql` repairs the
aggregate RPC by canonicalizing the company label. Hosted verification remains
pending deployment of these changes.

The Clients register confirms that `Russell` is the contact on the
`Clelands Construction` client, so the dashboard appears to be rendering the
contact label where the client/company label is expected. This narrows the
finding but does not remove it: the project dashboard still does not present
the same client identity as the Projects register.

The hosted Timesheets surface loaded successfully but contained no entries for
the selected week. Timesheet creation, clock-in/out, approval and financial
posting therefore remain **NOT PROVEN**; no worker fixture or identity was
created merely to fill this gap.

The authenticated Alpha Settings → Users & Permissions surface loaded the
organization owner (`corey`) as Active Owner and showed zero staff users and
zero pending invites. No user, role or permission mutation was performed.

This is **PROVEN** only for the owner-context membership surface and the
absence of currently configured staff/invites. It does not prove cross-role
denial, invite acceptance, role changes, or cross-organization isolation;
those require a separate safe test identity/organization and remain
**NOT PROVEN**.

## Synthetic Alpha Files folder lifecycle observation

The authenticated Alpha owner created a synthetic private-storage folder named
`Synthetic Private Storage Proof`. A fresh reload confirmed that the folder
metadata persisted in the project Files root. The folder action's delete
confirmation explicitly described moving the folder and subtree to deleted
items while retaining the underlying Storage objects.

After confirmation, a fresh reload showed the project Files root empty. Opening
the deleted-files view then showed `Synthetic Private Storage Proof` as a
deleted folder, with the synthetic owner, deletion date, original location
(`Files root`) and size `0 B`. Restore and permanent purge were not exercised.

This provides **PROVEN** evidence for private Files folder persistence and
recoverable-delete listing semantics for the owner path. It does **not** prove private file-byte upload,
signed retrieval, Storage authorization, versioning, or restore behavior. The
synthetic folder contains no customer or provider data; no permanent deletion
was performed.

### Files evidence reconciliation

The current Alpha Files root showing `No files yet` is consistent with the
observed hosted state. The only synthetic object previously created in this
workspace was the zero-byte folder metadata record `Synthetic Private Storage
Proof`. It was moved to Deleted files by the authenticated owner; the deleted
items view currently lists it as a folder, with original folder `Files root`
and size `0 B`. No hosted file metadata row was observed.

The local repository fixture
`artifacts/phase1y-d-synthetic-files/alpha-private-storage-proof.txt` still
exists, but it was never uploaded through the hosted Files workflow. It is
therefore not evidence of a hosted Storage object. The repository source
confirms that a real file upload would create a `document_nodes` file row and a
`document_versions` reservation/version associated with the private
`organization-documents` bucket; neither was observed for this fixture.
The hosted UI does not expose enough information to independently assert that
an orphaned Storage object exists, and no such object is evidenced by the
current metadata.

The previous instruction to select the local `.txt` file incorrectly implied
that a hosted synthetic file already existed. That statement was not supported
by the current metadata and is corrected here. The smallest safe next action
for the remaining Files proof is one upload of this existing, non-production
local fixture through Alpha Files. No replacement fixture or cleanup is needed.
The upload/selection is the unavoidable human browser action if the file
chooser cannot be driven; Codex can then verify the resulting metadata,
private retrieval/authorization and lifecycle evidence without changing the
product or database design.

### Hosted private file upload, retrieval, delete and restore proof

The existing local fixture was subsequently uploaded through the authenticated
Alpha owner path. The hosted Files workspace displayed
`alpha-private-storage-proof.txt` with owner `corey`, type `TXT`, size `139 B`,
version `1`, state `Active`, in `Files root`. The owner downloaded it through
the Files `Download` action; Chrome completed the download at `139 B`.

The same file was then soft-deleted through the owner action. The confirmation
stated that immutable versions are retained. Deleted files listed the file at
`139 B` in its original `Files root` location. The owner restored the deletion
batch, and a fresh Files-root load showed the same file active again at `139 B`.

This is **PROVEN** for authenticated private-file upload, metadata
persistence, owner retrieval, recoverable deletion and restoration. No
permanent purge was performed. A second uploaded version, signed-URL details,
cross-role denial and cross-organization denial remain unproven; the current
owner path alone cannot establish those boundaries.

### Recurring worker schedule follow-up

The Alpha worker workflow and health workflow were both changed to offset
their schedules from round-minute load spikes:

- Takeoff worker: `2-59/5 * * * *`;
- Health check: `7-52/15 * * * *`.

Both workflow files remain active, but no `schedule` event was observed after
the first eligible offset window; all observed runs remain manual
`workflow_dispatch` runs. The worker therefore remains **MANUAL-VERIFIED,
SCHEDULE-NOT-PROVEN**. This is an operational gap, not evidence that the
worker token or renderer is broken.

Both workflows were safely disabled and re-enabled through the GitHub Actions
workflow controls; both report `active` afterward. The first eligible worker
slot after re-enablement still produced zero `schedule` event runs at
20:47 UTC. This rules out a merely disabled-workflow state in the current
evidence and leaves scheduler capability/registration unresolved.

A further read-only check at 20:50 UTC confirmed that both workflow definitions
are on the Alpha default branch and active, with the configured offset cron
expressions still present. GitHub continued to report zero `schedule` event
runs for both workflows. Manual dispatch remains the only verified execution
path; no additional cadence change was made.

The next eligible Takeoff worker slot was observed at 20:57 UTC. Queries at
20:57:07 and 20:57:42 UTC still returned zero schedule-triggered runs across
the worker, health and backup workflows. The schedules remain active and the
manual path remains healthy, but recurring execution is not proven on the
current free GitHub setup.

A repository-policy inspection then confirmed that GitHub Actions is enabled,
all actions are allowed, the default branch is `main`, and the repository has
30 `workflow_dispatch` runs plus one `push` run but zero `schedule` runs. The
absence is therefore not explained by a disabled Actions repository or a
missing workflow secret; it remains an unresolved GitHub scheduler capability
or delivery issue.

## Scheduler sub-gate status

**DEFERRED — IMPLEMENTATION COMPLETE; HOSTED VERCEL PRO CRON PROOF PENDING
OWNER ACTIVATION.** The current no-cost GitHub setup has proven manual worker,
backup and health execution, and the controlled manual worker has now proved
the newly uploaded drawing path. Recurring hosted execution is intentionally
not claimed while Vercel Pro remains unapproved for cost reasons. No paid
provider was activated and no provider credential was changed during this
investigation.

The Alpha Vercel project currently has an empty `vercel.json`, so it has no
Vercel Cron registration. Current Vercel plan documentation states that Hobby
cron jobs are limited to once per day, while more frequent schedules require
Pro. No paid upgrade was made. A real-customer worker cadence therefore
remains a deferred hosted-operations gate; it must not be represented as
commissioned yet.

## Provider-off AI surface

The authenticated Alpha owner also opened the project AI Assistant while
OpenAI/Anthropic remained unconfigured. After its normal history-load window,
the surface reached its empty state with `New Chat`, prompt controls and a
`0 / 50` usage indicator. No prompt was submitted and no provider request was
made. This is a safe-degradation/navigation proof only; AI generation remains
uncommissioned until its provider pass is separately approved.

## Additional hosted capability findings

The same authenticated Alpha project was checked read-only after the Takeoff
fix:

- **QA:** the synthetic Alpha path now proves persisted definition creation,
  required inspection configuration, run start, response autosave, completion,
  read-only transition and final sign-off. Photo/file evidence, hold-point
  release and cross-role authorization remain unproven.
- **Takeoff:** the synthetic upload persisted, the existing controlled worker
  completed successfully, and the resulting Measure Workspace rendered the
  uploaded drawing. Recurring worker scheduling remains deferred separately.
- **Scope Builder:** the hosted project surface loaded and correctly required a
  trade-pack PDF or existing stored scope before execution. Alpha had no
  stored scope or selected trade pack, so generation, persistence, copy and
  download remain **NOT PROVEN**; no source PDF was uploaded merely to fill
  this evidence gap.
- **Files:** the private Files surface now proves authenticated upload of the
  139 B synthetic TXT fixture, metadata persistence, owner download, soft
  deletion and restoration. Version creation, signed-delivery details and
  cross-role/cross-organization authorization remain unproven.
- **Site Safety:** the landing page and seven subroutes remain explicit
  placeholder surfaces. The owner has explicitly excluded Site Safety
  workflows from the Customer #1 readiness scope for this commissioning pass;
  they remain deferred product scope and are not counted as a Customer #1
  blocker.

These findings are recorded by capability: QA is **PROVEN** for the synthetic
owner path above; Files is **PROVEN** for the authenticated owner upload,
retrieval, soft-delete and restore path, with authorization boundaries still
unproven; Site Safety remains explicitly excluded. The QA and Files
mutations were synthetic and limited to the commissioning records described
above; no Site Safety mutation was performed.

The hosted Settings → Integrations surface also reports Xero as **Not
connected**. The existing Xero integration path is present and has not been
removed or bypassed; OAuth/provider connection and synchronization therefore
remain uncommissioned and require a separate owner/provider approval step.

## Controlled release status for hosted defects

The local dashboard identity fix, QA relationship query fix and forward
dashboard migration now pass the authoritative local release validation and
pre-hosting readiness gates. Those gates deliberately report owner
authorization as not granted and prohibit provider login, deployment, publish,
cloud mutation and customer-data mutation. Alpha's remote migration ledger
also remains behind local state by the pre-existing
`20260927110000_reconcile_required_storage_buckets.sql` migration. The
controlled Alpha release and hosted verification are recorded in the
post-release addendum below.

## Anonymous boundary checks

Unauthenticated HTTP checks against the deployed Alpha returned:

- private project pages: `307` to `/login`;
- the Takeoff worker `POST`: `401 Unauthorized`;
- the public application root: `200` with non-empty HTML.

This is a focused hosted access-boundary proof. It does not replace
authenticated cross-organization, role, RLS or private Storage authorization
tests.

## Evidence classification

- **CURRENT:** Financials is a hosted project read model assembled from the
  accepted quote, approved variation and reconciliation data.
- **PROVEN:** The Alpha owner can load the financial summary and expand a
  source-linked budget detail without email or external-provider configuration.
- **NOT PROVEN:** Full commercial lifecycle, approved purchase-order spend,
  posted supplier-invoice actuals, export/download coverage, outsider denial
  for this exact surface, and every financial reconciliation path.
- **DEFERRED:** Xero/accounting synchronization remains provider-dependent and
  unchanged.

## Preservation

This proof changed none of:

- email, SMTP, DNS or sender configuration;
- Xero, AI or other provider configuration;
- Vercel cron or background-job enablement;
- database schema, migration, RLS or Storage policy;
- Auth, tenancy, permissions or worker security;
- commercial lineage, quote revisions, variation records or accounting data.

## Controlled Alpha release and hosted revalidation addendum — 2026-10-03

This addendum is the current hosted evidence for the reviewed Alpha release.
It supersedes the earlier pending-release classification above while
preserving the historical defect findings.

### Release identity and migration sequence

- Alpha was promoted at commit `f6507e558c2ac3f3ee59dbcc3064b51f6805d6f7`.
- The controlled release included only the reviewed dashboard client-identity
  fix, QA relationship qualification fixes, and dashboard identity migration.
- The previously executed required-Storage reconciliation was recorded in
  Alpha's remote migration ledger as applied for
  `20260927110000_reconcile_required_storage_buckets.sql`; its SQL was not
  replayed.
- `20261003120000_fix_project_dashboard_client_identity.sql` was dry-run
  against Alpha and then applied as the only pending SQL migration.
- The unrelated
  `20260810190000_cleanup_phase1_material_test_fixtures.sql` migration was
  intentionally not applied.
- Post-promotion migration listing shows both `20260927110000` and
  `20261003120000` applied in Alpha. No reset, truncate, recreate, data
  deletion or destructive migration was performed.

### Hosted deployments and validation

- First controlled production deployment:
  `dpl_D1s26Z6BrCwbKc578tLUcsUaR7Qm`, READY.
- Second narrow production deployment after hosted QA exposed a distinct
  inspection relationship ambiguity:
  `dpl_BvAhgFrjQpDrQikQgcVsAJ7LmCfy`, READY and serving the Alpha production
  alias. The second deployment qualified
  `project_quality_inspection_items_inspection_scope_fkey`; it did not alter
  QA data or schema.
- Alpha production build and TypeScript validation passed for both releases.
  Targeted dashboard and QA tests passed. Targeted lint reported no errors;
  existing ProjectDashboardBoard warnings remain non-blocking baseline
  warnings. Alpha's full `lint:release` script remains unavailable because
  that checkout lacks the referenced `scripts/ops` path; this is a
  pre-existing script mismatch, not a release regression.
- Anonymous hosted checks continue to prove the public root returns `200`,
  protected project routes redirect to `/login`, and unauthenticated project
  creation returns `401`.

### Hosted business evidence after promotion

- **Project dashboard client identity — PROVEN:** authenticated Alpha
  dashboard for `NP Control Tower` now displays `Clelands Construction`,
  matching the authoritative Projects register instead of the prior contact
  label `Russell`.
- **QA relationship/activity — PROVEN for the existing owner path:** the QA
  list loads the synthetic QA Proof record (one section, one check,
  completed), and Existing QA Activity now loads successfully. It displays
  the existing `Synthetic QA Defect Proof` activity as `Verified`, with no
  relationship ambiguity or query error. This does not prove cross-role
  denial, photo/file evidence, hold-point workflows or all QA mutation paths.
- **Files preservation — PROVEN for previously established evidence:** the
  existing `alpha-private-storage-proof.txt` remains present in the project
  Files root with its owner, size and active state after both deployments.
  Prior authenticated upload/download evidence remains intact. Remaining
  cross-role, cross-organization, versioning and signed-URL evidence gaps
  remain open and were not reopened or mutated here.
- **Takeoff preservation — PROVEN for existing evidence:** both existing
  Alpha drawing sets remain visible and Ready after promotion. No worker,
  drawing-set, measurement or Storage data was changed.

### Release safety and scope

No Auth, tenancy, permission, RLS, Storage policy, worker-token, retention,
Files, commercial, accounting, Xero, AI, email, Vercel Cron or provider
configuration was changed. The release targeted fictional Alpha only.

The overall Customer #1 readiness programme remains **IN PROGRESS**. Vercel
Pro Cron, Xero, Resend/Supabase Auth email and AI activation remain deferred;
Site Safety remains excluded from Customer #1 scope. This release clears the
dashboard/QA defect checkpoint but does not by itself establish Customer #1
production readiness.

## Additional hosted read-model checks — 2026-10-03

After the controlled release, the authenticated Alpha owner re-opened the
existing provider-independent financial and claims surfaces without creating
or changing records:

- **Project financials — PROVEN for the existing persisted read model:**
  `NP Control Tower` rendered the accepted baseline quote `Q-26001-1`, current
  budget `$4,290.97`, original budget `$2,822.99`, approved variations
  `$1,467.98`, and the existing zero committed/posted-spend state. Budget
  structure and spend activity both rendered with source/status labels. This
  does not prove approved PO spend or posted supplier-invoice actuals.
- **Payment claims and retention — PROVEN for existing persisted readback:**
  the project claims surface rendered submitted claim `26002-PC-01` with
  gross `$3,555.76`, outstanding `$3,555.76`, and retention `$355.58`; the
  retention ledger rendered `26002-RC-01` as Submitted with `$355.58`
  outstanding. The retention detail opened successfully, showed its locked
  immutable-submission evidence and linked payment-claim origin. Xero status
  remained `Not synced`/`Not ready`, as expected while provider activation is
  deferred. No claim, retention, payment or accounting mutation was made.

These checks strengthen hosted persisted readback but do not convert the
unproven approval, payment, accounting-posting, provider-sync, cross-role or
full commercial lifecycle checks into passes.

## Supplier-invoice review transition check — 2026-10-03

The existing synthetic Alpha invoice `SYNTH-INV-001` was opened from the
authenticated Supplier Invoices workspace. Its persisted state was intact:
Trade Direct, matched PO `26002-PO-01`, one allocated `$110.00` line, and
`Needs Review`. The owner-only **Send for Team Approval** action was exercised
once. The application refused the transition and displayed:

> Resolve routing, accounting and tax coding before site review.

This is **NOT PROVEN** for team approval/posting, but it is useful hosted
evidence that the current workflow gate is active and prevents an incomplete
invoice from entering site review. No provider call, Xero mutation, payment,
accounting posting, or record deletion occurred. The remaining evidence gap is
to provide valid routing/account/tax coding and the appropriate review role;
that was not bypassed or fabricated in this pass.

## Supplier-invoice PDF action recheck — 2026-10-03

The authenticated Alpha owner reopened the existing synthetic invoice
`SYNTH-INV-001` after the controlled release. The invoice still displayed its
persisted supplier, matched PO `26002-PO-01`, allocated line and `Needs Review`
state. No invoice fields, allocation, approval state or provider state were
changed.

The existing **Print PDF** control was inspected in the deployed application.
Its implementation is the browser action `window.print()`, rather than a
server-generated or downloadable PDF endpoint. Chrome's native print-dialog
handoff blocks the current automation surface and did not expose a verifiable
PDF artifact. The hosted invoice PDF workflow therefore remains **NOT PROVEN
FOR ARTIFACT CONTENT**; this is a browser-print verification boundary, not
evidence of an invoice persistence or matching failure. No replacement invoice
or document was created merely to force a pass.

## Takeoff calibration and linear measurement recheck — 2026-10-03

The authenticated Alpha owner reopened the existing synthetic drawing set and
completed the currently deployed calibration flow. The owner entered a
`1000 mm` reference, placed two points on the rendered drawing, and the
application reported `Scale set to 1000 mm`. After a full route reload, the
Takeoff surface still displayed the active `1000 mm` scale and enabled the
Distance, Linear and Area tools. Calibration creation and persistence are
therefore **PROVEN** for this synthetic owner path.

The first automation trace created a deliberately named synthetic linear
measurement, `Phase1Y-D Linear Proof`, which persisted with `0 mm`. The visual
trace did not establish that the two submitted points were distinct after
snapping, so that record is retained as inconclusive evidence rather than
treated as a product defect.

A clean native-coordinate trace then created `Phase1Y-D Linear Controlled
Proof`, which persisted as `1454 mm` after a full route reload. Under the same
active calibration, controlled native-coordinate traces also persisted
`Phase1Y-D Distance Proof` at `412 mm`, `Phase1Y-D Count Controlled Proof` at
`1 count`, and `Phase1Y-D Area Controlled Proof` at `44444 mm²`. Calibration,
Distance, Linear, Count and Area creation plus reload persistence are therefore
**PROVEN** for this synthetic owner path. No existing measurement, commercial
record, drawing or Storage object was overwritten or deleted.

## Client-local scheduler dispatcher deployment — 2026-10-03

The provider-independent scheduler dispatcher was absent from the prior Alpha
deployment and returned `404`. The already-tested dispatcher boundary was then
promoted through the Alpha client repository as commit `4592cb1` and deployed
as Vercel production deployment
`dpl_J4Dgz7d7MW29tXq5DuNLMuTaGvsn`.

The required production `CRON_SECRET` was generated with high entropy and
stored only in Vercel's encrypted production environment configuration. It
was not written to source, logs, or this document. After redeployment,
unauthenticated requests to `/api/cron/dispatch` return `401 Unauthorized`
(including an attempted Takeoff job name), proving the hosted route is
present and fails closed.

Local dispatcher, route, registry and configuration tests passed: 16 focused
dispatcher/route/registry tests, plus the Alpha production build and
TypeScript validation. The Alpha production build lists
`/api/cron/dispatch` as a dynamic route.

This is **PROVEN** for the hosted client-local authentication and route
boundary. It is **NOT PROVEN** for recurring delivery, Vercel Cron timing or
retry behaviour, because Vercel Pro and any schedule registration remain
deferred. No business job was invoked and no customer data was mutated.

## Next smallest safe boundary

Continue Phase 1Y-D with the next existing synthetic-data read/export surface,
then separately close the authorization and persisted-output checks. Do not
enable cron or create provider fixtures merely to fill missing evidence. A
workflow remains incomplete when the current Alpha data does not exercise its
business semantics, even if its empty state renders successfully.

## Continued provider-independent commissioning — 2026-10-03

The hosted Alpha QA commissioning pass created a new synthetic QA run for
photo-evidence characterization:

- record: `449c1729-6b67-4321-903d-83e3fc35be10`;
- definition: `Synthetic QA photo proof`;
- location: `Synthetic photo evidence area`;
- initial state: In progress, 0/1 required responses saved, no photos.

The available browser upload bridge was unable to open the QA file chooser
before any file was selected. No photo was uploaded and no additional QA
mutation was made. Photo evidence therefore remains an open QA evidence gap;
the existing owner-path QA completion/readback proof is preserved.

The following provider-independent regression suite was then run against the
current Master source without database or hosted-provider mutation:

- 19 focused test files passed;
- 109 tests passed;
- coverage included project financial summaries and cost reporting, quote
  publication and award carry-through, quote revision/pricing surfaces,
  variation navigation, procurement/source import, payment-claim presentation,
  retention reconciliation/attribution/readiness, QA definitions, and Files
  workspace/upload-queue behavior.

This strengthens local implementation evidence but does not convert hosted
approval, accounting posting, cross-role authorization, QA photo evidence,
scheduled execution, or provider-sync gaps into hosted passes.

A second provider-independent regression batch also passed:

- 18 focused test files passed;
- 122 tests passed;
- coverage included quantities/spreadsheet and payment/retention/invoice PDF
  exports, PDF utilities, materials import/review/processing, document
  workspace upload/cleanup behavior, worker authorization, retention worker
  behavior, and learning-worker/scheduler contracts.

These are implementation and security-contract results, not substitutes for
hosted Alpha workflow evidence. No provider was activated and no hosted data
was changed by this batch.

Additional hosted Alpha readback was completed without mutation:

- **Variations — PROVEN for persisted register readback:** approved
  `26002-VAR-01` renders as `V1 - Plasterboard Linings` at `$1,468.55`, and
  the existing draft `26002-VAR-02` also renders. This proves the register
  and status/value read model, not a new variation approval transition.
- **Purchase orders — PROVEN for persisted register readback:** `26002-PO-01`
  renders for Trade Direct with `$1,110.00`, and the existing draft
  `26002-PO-02` remains visible. This does not prove a new PO issue/approval
  transition or posted spend.
- **Project quote — PROVEN for persisted accepted-quote readback:**
  `Q-26001-1` renders as Accepted with its line items, terms/clarifications,
  totals and a `View Source` link to the originating pricing worksheet. The
  project quote surface still uses its existing CRM client label (`Russell`);
  this is distinct from the corrected project-dashboard company identity and
  no new identity mutation was made.
- **Supplier-invoice PDF export — NOT PROVEN in this pass:** the hosted
  `Print PDF` control is present on `SYNTH-INV-001`, but the browser download
  bridge timed out without yielding a verifiable artifact. Local PDF export
  tests pass; no invoice data was changed.

Source reconciliation confirms that `Ready to send to the project team` is
the Team Approval panel's status copy for a not-yet-submitted invoice; it does
not claim that accounting/tax readiness is complete. The server action and
the authoritative workflow/RPC gate correctly remain responsible for routing,
coding and tax prerequisites. No UI change is justified by this observation.

- **Materials and supplier pricing — PROVEN for hosted persisted readback:**
  Alpha's Material Library rendered one active cost item, `13mm GIB Standard
  Plasterboard`, with preferred supplier Trade Direct, material-library cost
  `$12.77/m2`, and one supplier price at `$11.10/m2`; the detail view rendered
  the supplier-price relationship, preferred state and update date. This does
  not prove import execution, price-history mutation, AI enrichment or all
  downstream commercial publication paths.

- **Won opportunity readback — PROVEN for the existing Alpha path:** the Won
  quotes view rendered `NP Control Tower / Clelands Construction 26001`,
  owner `corey`, quoted amount `$3,246`, quoted date `29 Sept 2026` and due
  date `29 Oct 2026`. This strengthens opportunity → accepted quote
  continuity evidence; it does not prove a newly executed award transition in
  this pass.

Final local validation for this continuation also passed:

- `npm run check:boundaries` — passed;
- `npm run typecheck:release` — passed;
- `npm run build` — passed;
- focused operations/QA/supplier-invoice checks — 3 files, 17 tests passed;
- `git diff --check` — passed.

The production build enumerated the current project, procurement, claims,
retention, QA, Files, Takeoff and export routes successfully. This is not a
hosted acceptance result and does not alter the existing readiness verdict.

## Explicit non-verdict

This document does not declare Customer #1 readiness. Email/Auth delivery,
Xero, AI, scheduled operations, remaining background paths, full workflow
coverage and operational acceptance remain open or explicitly deferred.

## Controlled Alpha release revalidation — 2026-10-03

The previously approved Master → Alpha promotion was revalidated after the
owner authorized the controlled release checkpoint. No migration was replayed
and no Alpha data was reset, recreated, truncated, deleted, or otherwise
mutated by this revalidation.

**Release and migration evidence**

- Alpha repository `main` remains clean at `4592cb1543e9324fbba3150b849b0c9c45aae654`.
- The approved fix chain is present: `4101c24` (dashboard identity and QA
  relationship fixes), `f6507e5` (inspection relationship qualification), and
  `4592cb1` (client scheduler dispatcher already approved separately).
- The hosted production deployment inspected through Vercel is READY and is
  serving the Alpha production alias (`dpl_J4Dgz7d7MW29tXq5DuNLMuTaGvsn`).
- `supabase migration list --linked` reports both
  `20260927110000_reconcile_required_storage_buckets` and
  `20261003120000_fix_project_dashboard_client_identity` applied in Alpha.
  The unrelated `20260810190000_cleanup_phase1_material_test_fixtures.sql`
  remains intentionally unapplied.
- The forward migration is safe by construction for the reviewed target:
  it is a `create or replace function` over the existing dashboard aggregate,
  preserves the Xero-payment aggregate delegation, reads existing
  organization/project/client rows, and grants the existing authenticated
  execution contract. It does not rewrite business rows or weaken RLS.

**Hosted revalidation**

- **Project dashboard client identity — PROVEN:** after data loading, Alpha
  displayed `Project Name: NP Control Tower` and `Client: Clelands
  Construction`, confirming the company identity rather than the contact
  label. The dashboard remained populated with existing synthetic metrics and
  activity.
- **QA relationship/activity — PROVEN for the existing Alpha owner path:** the
  hosted QA route loaded the existing `Synthetic QA Proof` definition with its
  section/check counts and existing completed/in-progress record counts. The
  `Existing QA Activity` view loaded the existing `Synthetic QA Defect Proof`
  activity for `NP Control Tower` with status `Verified`; no QA record was
  modified.
- **Storage/Files/Takeoff preservation — PROVEN at the already established
  evidence level:** the release did not alter those records or policies. The
  separate synthetic QA photo run still has no attached photo and remains an
  open evidence gap; it was not forced during this release check.

**Release validation**

- Master release tests: `696` files passed, `5` skipped; `4,640` tests passed,
  `29` skipped.
- Master package-boundary check: PASS.
- Master release TypeScript check: PASS.
- Alpha release TypeScript check: PASS.
- `git diff --check`: PASS.
- The Alpha hosted deployment was already READY with a successful Vercel
  production build; no additional deployment was needed for this
  revalidation.

This closes the controlled Alpha release checkpoint for the reviewed fixes.
It does not close Customer #1 readiness: recurring scheduler delivery,
provider activation, backup/recovery operations, cross-role authorization,
remaining hosted workflow evidence, and other explicitly deferred gates remain
classified separately above.

### Controlled Alpha release approval recheck — 2026-10-03

The owner-approved controlled Alpha release was rechecked without replaying or
modifying the already-applied database migrations. The Alpha repository
`main` ref resolves to `4592cb1543e9324fbba3150b849b0c9c45aae654`, matching the
recorded approved release provenance, and Vercel deployment
`dpl_J4Dgz7d7MW29tXq5DuNLMuTaGvsn` is `READY` and serving the production alias.

The Alpha migration ledger was already recorded as containing the required
Storage reconciliation migration and
`20261003120000_fix_project_dashboard_client_identity.sql`; the unrelated
fixture-cleanup migration remains deferred. No reset, replay, truncate,
recreate, deletion, or data mutation was performed during this recheck.

Non-mutating hosted checks passed:

- public Alpha root: HTTP `200`;
- protected project route without a session: HTTP `307` to authentication;
- unauthenticated scheduler dispatcher: HTTP `401` with `Unauthorized`;
- Alpha deployment status: `READY`.

Local release checks passed:

- focused dashboard/QA/Storage regression set: `4` files, `12` tests passed;
- authoritative release validation: all local gates passed;
- production build: passed with Next.js `16.3.8`.

The dependency-audit UUID override is validated locally but was not included
in this Alpha promotion because it is outside the owner-approved Storage,
dashboard-identity and QA release scope. It remains pending a separate
controlled release decision if hosted dependency remediation is required.

## Additional hosted Takeoff worker evidence — 2026-10-03

The previously queued Alpha drawing was rechecked after the separate Takeoff
worker path had successful bounded manual invocations recorded in the private
Alpha repository. The hosted Measure route now opens the drawing rather than
remaining in the `waiting for a worker` state:

- drawing set: `589bd0b1-1ca9-426a-9927-c98f58edf043`;
- rendered page: `a29db43d-b1b0-4a41-becc-9277e22e832a`;
- hosted Measure sidebar: `Wall colour`, `Page 2`, persisted `1.57 m²` summary;
- measurement controls are present, with uncalibrated distance/linear/area
  controls correctly disabled and the persisted summary available.

This is **PROVEN** for the separate Takeoff worker boundary processing a
synthetic Alpha render job and making the resulting rendered page/summary
available through the hosted application. It does not prove recurring
scheduler delivery, the full calibration/count/linear/area mutation matrix,
or the worker's production operational coverage for a real customer. The
Takeoff worker token remains separate from the scheduler secret.

## Additional operational health evidence — 2026-10-03

The existing Alpha production-health workflow was manually dispatched once
(`37079562619`) against the current Alpha commit. It completed successfully
and verified:

- the public Alpha application returned non-empty HTML;
- the HTML response passed the document-shape check;
- the latest successful encrypted-backup workflow was within the 24-hour RPO
  freshness window.

This is **PROVEN** for the health-check implementation and current backup
freshness signal. It remains **NOT PROVEN** for recurring GitHub schedule
delivery, because scheduled execution is intentionally not being used as
evidence and the owner has classified that path as unproven.

The hosted Takeoff calibration control was also opened against the same
synthetic drawing. Its reference-length/unit dialog rendered with the
expected millimetre default, but the available browser control could not
submit a safe canvas reference line. The dialog was cancelled without saving
and the existing `1.57 m²` synthetic summary remained unchanged. Calibration
and the downstream full measurement mutation matrix therefore remain **NOT
PROVEN**, with no data mutation from this attempt.

## Additional hosted commercial and operational workflow evidence — 2026-10-03

Further hosted Alpha checks were performed without provider activation or
cross-organization mutation.

- **Variations — PARTIALLY PROVEN:** the existing `26002-VAR-01` record opened
  in the hosted detail workspace as `Approved`, with its persisted source item,
  quantity, unit price, markup, GST and pricing summary. The variation-to-
  pricing-worksheet link was present. Full mutation, approval transition,
  attachment/export artifact verification and cross-role authorization remain
  open.
- **Purchase orders — PARTIALLY PROVEN:** `26002-PO-01` opened with persisted
  supplier `Trade Direct`, material-supply type, line item, quantity, unit
  price, GST and total. The detail workspace also showed the current
  Bills/Invoices panel and correctly reported that no supplier invoice had
  been allocated to this PO. Full lifecycle transitions, PDF artifact
  verification, attachment behavior and cross-role authorization remain open.
- **Payment claims — PARTIALLY PROVEN:** `26002-PC-01` opened as `Submitted`
  with persisted claim-period dates, contract value, approved variation value,
  gross claim, retention held, GST and payable totals. The hosted Accounting
  Sync panel correctly exposed Xero readiness items rather than pretending the
  claim was synchronized. Xero activation and provider-side synchronization
  remain **DEFERRED**, not product failures.
- **Retention — PARTIALLY PROVEN:** the claims register displayed the
  persisted `26002-RC-01` retention claim as `Submitted`, with NZ$355.58
  claimed, NZ$0 paid and NZ$355.58 outstanding. The project claim detail also
  displayed retention held and unreleased balances. Payment/release lifecycle
  and provider synchronization remain open.
- **Tasks — PROVEN for create and persistence:** the hosted Alpha Tasks
  workspace initially had no task records. A reversible synthetic record named
  `Phase1Y-D Task Proof` was created through the existing Add Task UI with its
  description, default `To Do` status, `Medium` priority and unassigned state.
  The saved row remained visible after the modal closed and showed the expected
  task table fields. Status-transition persistence and role-negative coverage
  remain open; the synthetic record is retained as commissioning evidence.

These checks do not change the overall readiness verdict. They add hosted
evidence for persisted commercial and task surfaces while leaving artifact
exports, provider synchronization and cross-role authorization as separate
open gates. The controlled Takeoff calibration and measurement matrix is now
PROVEN for the synthetic owner path; the earlier zero-valued records remain
inconclusive automation artifacts.

- **Project financials — PARTIALLY PROVEN:** the hosted project Financials
  surface reconciled the accepted baseline quote `Q-26001-1`, approved variation
  value and current budget of NZ$4,290.97. It explicitly showed NZ$0 committed
  and NZ$0 spent, with the expected explanation that no qualifying PO or posted
  actual-cost ledger events exist yet. The budget-structure and spend-activity
  totals were internally consistent for the current synthetic state. Full
  committed-cost and posted-actual reconciliation remains open until a safe
  qualifying procurement/accounting lifecycle is exercised.
- **Project activity continuity — PROVEN for the new task event:** after the
  synthetic task save, the hosted project dashboard's “What's Coming Up Next”
  feed displayed `Task updated Phase1Y-D Task Proof (To Do)`, linking back to the
  project Tasks workspace. This proves the current task write is reflected in
  the project activity surface; it does not prove all activity types or role
  visibility permutations.

The earlier zero-valued records remain retained as commissioning artifacts;
their values are attributed to the ambiguous locator interaction and point
snapping, not to the validated native-coordinate path.

## Hosted quantities Excel export — 2026-10-03

The hosted Alpha Quantities route was loaded against the populated synthetic
drawing set and exposed `Export Excel`. The resulting workbook
`NP Control Tower - Quantities - 2026-10-03.xlsx` was found in the browser
Downloads folder and validated as a readable Office Open XML workbook:

- archive integrity: **PASS** (`unzip -t` reported no errors);
- worksheet: `Quantities Export`;
- project/drawing-set identity and export date were present;
- the workbook contained the persisted controlled Distance, Linear, Count and
  Area values plus the existing Wall quantity and secondary perimeter values;
- exported values matched the hosted quantities surface, including
  `411.534514 mm`, `1454.159724 mm`, `1 count`, `44444.444446 mm²` and
  `1.573012 m²`.

This is **PROVEN** for the hosted quantities Excel export artifact. It does
not prove every future spreadsheet-import workflow or every report/export
surface.

## Additional hosted workflow inventory — 2026-10-03

A further read-only pass inspected the remaining provider-independent Alpha
surfaces without creating identities, uploading files, activating providers,
or mutating records.

- **Materials — PROVEN for current persisted library/read-model evidence:** the
  hosted Material Library displayed one active cost item,
  `13mm GIB Standard Plasterboard`, preferred supplier `Trade Direct`, cost
  `$12.77/m2`, one linked supplier price and an active status. The import
  control is present, but import execution and price-history mutation were not
  attempted without an explicitly approved fixture upload.
- **Suppliers — PROVEN for current persisted register/read-model evidence:**
  two active synthetic suppliers rendered with contact, payment-term/readiness,
  status and explicit `Unlinked` Xero state. This does not prove Xero sync or
  cross-role supplier authorization.
- **Supplier invoices — PARTIALLY PROVEN:** `SYNTH-INV-001` rendered as a
  persisted manual invoice for `Trade Direct`, dated 03/10/2026, due
  02/11/2026, total NZ$110.00 and status `Needs Review`. The review/approval
  surface is present; allocation/matching, accounting posting and verifiable
  PDF artifact generation remain open.
- **Tasks — PROVEN for persisted owner-path readback and activity continuity:**
  `Phase1Y-D Task Proof` remained visible with its description, `To Do` status,
  medium priority and unassigned state. This confirms the existing task record
  and project activity feed evidence; status transitions and role-negative
  coverage remain open.
- **QA — PARTIALLY PROVEN:** the hosted Project QA surface rendered
  `Synthetic QA Proof` with one section, one check, one completed record and
  one in-progress record, together with the existing Start/View/Edit controls.
  Existing QA Activity had already rendered the related verified activity.
  Photo evidence, full completion/sign-off mutation and cross-role coverage
  remain open; Site Safety is excluded from Customer #1 scope.
- **Variations — PARTIALLY PROVEN:** the register rendered approved
  `26002-VAR-01` at $1,468.55 and draft `26002-VAR-02`. This is persisted
  register evidence, not a new approval transition or full artifact/role proof.
- **Purchase orders — PARTIALLY PROVEN:** the register rendered `26002-PO-01`
  for Trade Direct at $1,110.00 and draft `26002-PO-02`. Existing detail
  evidence covers the line and supplier relationship; issue/approval,
  invoice allocation and posted-spend transitions remain open.
- **Payment claims and retention — PARTIALLY PROVEN:** the hosted claims
  surface rendered submitted `26002-PC-01` with NZ$3,555.76 gross and the
  retention ledger rendered `26002-RC-01` with NZ$355.58 claimed and
  outstanding. Xero synchronization, payment/release transitions and
  cross-role authorization remain deferred/open.
- **Project financials — PARTIALLY PROVEN:** the report reconciled the accepted
  quote and approved variations to a NZ$4,290.97 current budget, while showing
  zero committed and posted spend with the expected explanation. A qualifying
  procurement/accounting lifecycle is still required for full spend
  reconciliation proof.
- **Accepted quote detail — PROVEN for persisted readback:**
  `Q-26001-1` rendered as Accepted with line items, terms/clarifications and
  NZ$2,822.99 subtotal. The existing CRM client label on the quote detail is
  distinct from the corrected project-dashboard company identity.

No additional safe provider-independent hosted mutation was identified in this
pass. Materials import, invoice allocation/posting, full procurement-to-spend
reconciliation, QA photo/sign-off, cross-role authorization and lifecycle
transitions require either an approved fixture/action, additional test
identities, or provider/account boundaries. They remain open evidence gaps,
not reasons to alter the product or mark the whole programme stalled.

## Supplier-invoice detail and quote-export recheck — 2026-10-03

The existing Alpha invoice detail was opened read-only for
`SYNTH-INV-001`. It showed the canonical `Trade Direct` supplier, referenced
PO `26002-PO-01`, a persisted `NZ$110.00` line allocated to the PO line
`13mm standard GIB`, and the existing activity trail for creation, matching
and review routing. The Team Approval control remained available and the
Xero Draft Bill action remained disabled until approval. This upgrades the
current Alpha evidence to **PARTIALLY PROVEN — matching/allocation and review
handoff readback**, while team approval, accounting posting and Xero remain
open/deferred. No invoice mutation was made in this recheck.

The accepted quote detail exposed its existing `Export PDF` control. A
read-only hosted invocation did not yield a new verifiable PDF artifact in
the Downloads folder, so quote PDF artifact verification remains **NOT
PROVEN**. The accepted quote data and line-item readback remain proven; no
quote data was changed.

## CRM and opportunity continuity recheck — 2026-10-03

The hosted Alpha CRM surfaces were rechecked without mutation:

- **Opportunities — PROVEN for persisted won-quote continuity:** the Won
  quotes view rendered `NP Control Tower / Clelands Construction 26001`,
  owner `corey`, quoted amount `$3,246`, quote date 29 September 2026 and due
  date 29 October 2026, linking to the accepted quote detail.
- **Clients — PROVEN for persisted client/project relationship readback:**
  the Clients view rendered the single Alpha client `Clelands Construction`,
  contact `Russell`, one total project and the existing inactive Xero state.
  This remains readback evidence; Xero activation and cross-role CRM
  authorization remain deferred/open.

These checks strengthen the existing Opportunity → accepted Quote → Project
continuity evidence without creating or changing CRM records.

## Current release validation recheck — 2026-10-03

Against the current worktree, the package-boundary check passed and the
release TypeScript check passed. A focused provider-independent workflow
regression batch also passed:

- 7 test files passed;
- 88 tests passed;
- coverage included persisted quote PDF snapshot construction and quote detail
  loading, supplier-invoice allocation/tax behavior, Materials import UI
  contracts, QA record presentation, and payment-claim detail/PDF contracts.

This is source/regression evidence only; it does not convert the remaining
hosted fixture, cross-role, provider or scheduled-operation gaps into passes.

The current production build also passed after this recheck. Next enumerated
the current project, procurement, claims, retention, QA, Files, Takeoff,
Materials, import, scheduler-dispatch and provider-boundary routes without
compile or route-generation errors. This remains build evidence, not hosted
workflow acceptance.

The authoritative local release validation then passed all current checks:
toolchain, release lint, release tests, TypeScript, release identity, registry,
migration preflight, security and drift. Its output explicitly keeps
external/hosted/credential checks separate; no hosted or provider gate is being
silently promoted by this local result.

## Additional hosted task and QA lifecycle proof — 2026-10-03

Using existing synthetic Alpha records only, the following reversible,
provider-independent lifecycle transitions were exercised through the hosted
UI:

- **Tasks — PROVEN for status transition and persistence:**
  `Phase1Y-D Task Proof` was changed from `To Do` to `Done` through the
  existing task editor. The record was then reloaded and retrieved through the
  `Done` status filter with its title, description, priority and assignee
  state intact. No SQL or console bypass was used.
- **QA — PROVEN for run, required response, completion and final sign-off:**
  `Synthetic QA Proof` was started as a new hosted run. Its required
  `Concrete inspection` response was marked `Pass`, the record reached `100 %
  ready`, and `Complete QA` produced a completed read-only record. The final
  sign-off was then saved with signer `corey`, and the hosted detail displayed
  the signed-off state and timestamp. No photo was uploaded; photo-evidence
  coverage therefore remains a separate open evidence gap.

These mutations affected only fictional Alpha synthetic commissioning records.
No Auth identity, provider, Storage object, commercial record, RLS policy or
cross-organization data was changed.

## Purchase-order action-safety recheck — 2026-10-03

The hosted NP Control Tower Purchase Orders register was rechecked. The
existing `26002-PO-01` record remains `Draft` for `Trade Direct` at
`$1,110.00`; `26002-PO-02` remains a draft `$0.00` record. The register action
surface exposes Edit and Delete, not a read-only issue/approval transition.
No PO was issued, approved, deleted, invoiced, or synchronized. Procurement
therefore remains **PARTIALLY PROVEN**: persisted register/detail evidence is
available, while the commitment, approval, invoice-allocation and posted-spend
transitions require a deliberate synthetic accounting action and remain open.

The current Alpha `26002-PC-01` PDF endpoint was also attempted as a direct
authenticated read/export check. The connected browser blocked the endpoint
with `ERR_BLOCKED_BY_CLIENT` before an artifact could be inspected, so this is
not counted as new PDF evidence. Existing converted-project claim PDF evidence
remains valid; the current `26002-PC-01` artifact remains **NOT PROVEN** in
this pass.

## Additional hosted timesheet/export check — 2026-10-03

The current Alpha `NP Control Tower` Timesheets workspace was opened and its
owner-path `Clock In` control was exercised without creating a new identity or
using a database bypass. The hosted page remained at zero entries and did not
produce a persisted clock-in row. The current UI requires browser geolocation
for clock-in/clock-out; the connected browser did not return a usable location
result, so the location-gated mutation could not be safely completed in this
pass. This leaves the current owner-path clock-in/clock-out evidence gap open;
it is not classified as a product defect from this attempt.

The existing Timesheets export control was also exercised. It produced
`/Users/corey/Downloads/time-sheets-2026-10-03 (1).csv`, which is a readable
CSV with the expected labour/time/location/notes header. Because the selected
range had no current entries, this proves the empty-range export path only;
non-empty timesheet export remains **PARTIALLY PROVEN**.

The focused time-sheet worker-auth security test passed independently:
`tests/security/time-sheet-worker-auth.test.ts` — 1 file, 6 tests passed.
No database, Storage, Auth, permission, provider or unrelated Alpha data was
changed by this check.

## Readiness-ledger reconciliation — 2026-10-03

An older operational snapshot under `ops/hardening/client-alpha.json` records
the GitHub backup workflow as a live scheduled run. That snapshot predates the
owner decision that GitHub recurring execution is **NOT PROVEN** and must not
be used as current scheduler evidence. The current authority is:

- client-local dispatcher and scheduler adapter: **IMPLEMENTATION COMPLETE**;
- hosted Vercel Pro Cron execution: **DEFERRED — OWNER/COST ACTIVATION**;
- GitHub recurring schedule execution: **NOT PROVEN** and not being retried;
- backup/RPO evidence: **CONDITIONALLY PROVEN** only to the extent recorded by
  the approved independent encrypted-run and restore evidence; it is not a
  claim of managed Supabase PITR or scheduled-provider reliability.

This reconciliation changes documentation authority only. It does not alter
the backup workflow, scheduler, secrets, hosted data, or provider settings.

## Current Alpha task-persistence reconciliation — 2026-10-03

A fresh authenticated read of the current Alpha route
`/app/projects/np-control-tower/job-management/todos` initially showed
`No tasks yet` under `All Status`. Source and hosted behavior explain this
state: the current Tasks implementation intentionally excludes completed
(`Done`) tasks from the `All Status` view. Selecting the explicit `Done` filter
then rendered `Phase1Y-D Task Proof` with its original description and `Done`
status, together with the other persisted synthetic completed tasks.

The earlier task create/status/reload evidence is therefore still valid and
the current task workflow remains **PROVEN** for the owner path. The apparent
discrepancy was a filter/read-model presentation rule, not data loss or a
persistence regression. No replacement task, SQL, console or destructive
operation was used during this reconciliation.

The same explicit `Done` filter also rendered `Synthetic QA Defect Proof` with
its persisted description identifying the Quality Assurance issue origin.
This strengthens the existing task/defect readback evidence, while full
cross-role issue authorization and notification delivery remain open.

## Current hosted quote export recheck — 2026-10-03

The current Alpha project quote detail loaded accepted revision `Q-26001-1`
with its persisted line items, source link and subtotal. The `Export PDF`
control was enabled and invoked. The implementation uses a browser popup and
print flow rather than a direct file download; this connected browser produced
neither a downloadable artifact nor a retained popup tab. The quote PDF
artifact therefore remains **NOT PROVEN** in hosted Alpha. No quote data or
commercial state was changed.

On a subsequent retry, the popup permission was effective: `Export PDF` opened
the generated quote export in a new `blob:` tab titled
`corey Organization - NP Control Tower - Q-26001-1`. The controlled browser
interface cannot inspect or save that `blob:`/print surface, so this upgrades
the result to **POPUP GENERATION PROVEN; FINAL PDF ARTIFACT NOT PROVEN**. A
human print/save action is still required to verify the final PDF bytes and
rendered artifact; no commercial state changed.

## Supplier Invoice Team Approval gate recheck — 2026-10-03

The existing synthetic `SYNTH-INV-001` invoice was safely submitted through
the hosted `Send for Team Approval` action after its PO match and allocation
were already present. The application rejected the transition with the
explicit message: **Resolve routing, accounting and tax coding before site
review.** The invoice remained `Needs Review`, the PO line remained waiting,
and the Xero action remained disabled. No invoice, accounting, provider or
commercial data was changed by the attempted transition.

This is **NOT PROVEN** for Team Approval, with a precise product workflow
precondition identified. The precondition must be satisfied through the
existing supported routing/accounting/tax path before approval is retried; no
SQL bypass, invented provider mapping or synthetic shortcut was used.
## Hosted pricing worksheet → Purchase Order recheck — 2026-10-03

The current Alpha pricing worksheet mapping surface was inspected without
creating or changing a Purchase Order. The worksheet contained the synthetic
material values `13mm standard`, `$12.77`, `1.573012`, and `M2`. In Purchase
Order Mapping Mode, only Description (`A4`) and Rate (`B4`) were mapped;
Quantity, Unit, and Total were unset. The preview consequently showed `0 Item
× $12.77` and `NZ$0.00`.

The Add to Purchase Order action remained enabled and an attempted submission
returned the hosted error `sourceLinkJson failed commercial item validation`.
No Purchase Order mutation was accepted by Alpha. This is not evidence that
the commercial source-link contract itself is unsafe: local source-link,
worksheet publication, Purchase Order adapter, and migration-contract tests
passed 33/33, and the current source builder emits the deployed validator's
required worksheet provenance fields.

Classification:

- **PARTIALLY PROVEN:** the worksheet and Purchase Order destination surfaces
  render and the mapping state is inspectable.
- **NOT PROVEN:** successful hosted worksheet-to-Purchase-Order publication.
- **PRODUCT DEFECT:** the UI permits submission while the mapped commercial
  line is incomplete. The resulting database validation error is misleading
  for this state.
- **SAFE NEXT FIX:** add a narrow application validation gate that prevents
  submission until the resolved commercial mapping is valid, then promote it
  through the controlled Master → Alpha release path. Do not weaken the
  database validator or repair Alpha with ad-hoc SQL.
- **PRESERVED:** no Alpha database, Purchase Order, commercial lineage,
  supplier, provider, Auth, Storage, or permission state was changed.
