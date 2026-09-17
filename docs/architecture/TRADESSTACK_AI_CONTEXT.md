Purpose: This document is persistent architectural and construction-domain context for AI coding agents working on TradesStack.

Authority rule: This document is guidance and historical architectural context. The current repository, current database schema/migrations, and current tests always override it when there is a conflict.

Maintenance rule: When major architecture changes, update this document in the same change or flag the affected section as stale.

Reconciliation note: This document was reconciled against repository state at branch main, HEAD 91f9a24ed26574d7241e732b87fe4135cfc193e5. Counts, permission keys, font wiring and Files tracking status were corrected at that revision. Repository state, schema counts and deployment status are point-in-time and must be re-verified before relying on them.

A. Executive System Summary
CONFIRMED. TradesStack is a multi-tenant construction subcontractor operating platform built with Next.js 16, React 19, Supabase/PostgreSQL, private Supabase Storage, Xero integration, and OpenAI/Anthropic-backed intelligence.
It spans:
- CRM and tender opportunities
- Drawing/document ingestion
- Takeoff and measurement
- Pricing worksheets
- Quotes and revisions
- Award/conversion into projects
- Purchase orders and procurement
- Variations
- Supplier invoices and actual costs
- Progress/payment claims and retention
- QA inspections, evidence, hold points and sign-offs
- Tasks, issues, defects and work proof
- Accounting integration
- AI assistants, document interpretation and organization-specific construction memory
The database is an active business-logic layer, not merely persistence. RLS, SECURITY DEFINER RPCs, triggers, snapshots, status transitions, append-only records, hashes, queues and reconciliation workflows encode critical behavior.
The repository is currently not clean:
- Branch: main
- HEAD: 91f9a24ed26574d7241e732b87fe4135cfc193e5
- Tracked modifications include lib/commercial-items-security-catalog.test.ts and next-env.d.ts
- Numerous untracked artifacts, reconciliation scripts, migrations and generated/type files exist
- Existing architecture documents explicitly warn that some current document/files work is present in the working tree but not committed
This audit was read-only. No files, migrations, database records or dependencies were changed, and tests were not executed.
B. TradesStack in Construction Terms
TradesStack primarily serves specialist construction subcontractors and trade businesses, rather than general-purpose builders or consultants.
The likely business is a trade contractor that:
1. receives tender opportunities;
2. reviews drawings and specifications;
3. quantifies work through takeoff;
4. builds an internal estimate;
5. issues a client-facing quote;
6. wins or converts the opportunity into a project;
7. procures materials and subcontracted work;
8. manages variations, costs, claims and retention;
9. records QA evidence and sign-offs;
10. hands over defensible commercial and quality records.
Actual roles represented by the system include:
- owner
- admin
- qs
- project_manager
- worker
The software maps these to likely construction responsibilities:
Application role	Construction interpretation
Owner/admin	Company director, commercial administrator or system administrator
QS	Estimator, quantity surveyor or commercial manager
Project manager	Delivery manager responsible for project execution, procurement, variations and claims
Worker	Site worker, foreman or field user with narrower permissions
Platform admin	TradesStack internal operator, separate from customer-company roles


Important terminology:
TradesStack concept	Construction meaning	Created from	Consumed by
Organization	One subcontracting company/tenant	Account setup	Every tenant-owned domain
Client	Principal, builder, main contractor or customer	CRM	Opportunities, projects, quotes, invoices
Contact	Person at a client/supplier/company	CRM/Xero matching	Communication and accounting
Opportunity	Tender or prospective job before award	Client/tender intake	Drawings, takeoff, pricing, quotes
Project	Awarded/live job workspace	Opportunity conversion or direct creation	Delivery, procurement, QA, claims
Quote	External commercial offer	Pricing worksheet/commercial lines	Client acceptance, award
Quote revision	Historical or successor quote version	Existing quote	Tender history and project pricing
Pricing worksheet	Internal estimate/build-up workbook	Opportunity or project	Quote, PO, variation
Scope	Work included/excluded in the trade package	Tender documents, estimator input	Quote and delivery planning
Commercial item	Shared priced semantic line	Worksheet, takeoff or manual entry	Quotes, POs, variations, cost lineage
Takeoff	Quantification from drawings	Drawing set/PDF	Pricing, quote, PO, variation
Drawing set	Group of tender/project drawings	File upload	Viewer, takeoff, change detection
Measurement	Length, area, count or geometry-based quantity	Takeoff viewer	Commercial publication and summaries
Purchase order	Supplier/subcontractor commitment	Manual, commercial lines or takeoff	Procurement, supplier invoices, costs
Supplier	Vendor or downstream subcontractor	Supplier directory	POs, invoices, Xero
Variation	Post-award change to scope/value	Project need, takeoff or worksheet	Client approval, claims, accounting
Cost item	Canonical commercial meaning/cost classification	Commercial documents	Cost codes, reporting, accounting
Labour	Labour hours/rates/cost records	Timesheets and labour budgets	Project cost reporting
Material	Catalogue/product/price data	Company catalogue/imports/suppliers	Worksheets, POs and costs
Task/todo	Assigned action	Project or QA/issue workflow	Delivery coordination
Issue/defect	Non-conformance or problem	QA/field observation	Rectification, comments, evidence
Inspection	Older quality check record	Legacy QA subsystem	Issues, sign-offs, photos
QA template	Reusable company quality definition	Company settings	Project QA definition
QA definition	Project-specific checklist/requirements	Template or blank definition	QA runs
QA record/run	Actual execution of a QA definition	Site activity	Evidence, hold points, sign-off
Hold point	Check that must be released before proceeding	QA definition/response	Completion gating
Evidence	Photo, document, measurement or signature	QA/site/accounting workflows	Defensible record
Project file	Versioned document in a project workspace	Upload	Drawings, contracts, evidence
Integration	External provider connection	Settings	Xero/accounting sync
Xero	External accounting platform	OAuth connection	Contacts, bills, sales invoices and status


These meanings are grounded in routes, migrations and services including organization_opportunities, organization_projects, commercial_items, project_quotes, project_purchase_orders, project_variations, takeoff_measurements, project_qas, supplier_invoices, project_claims and organization_xero_connections.
C. Repository and Technical Stack
Repository state
- Branch: main
- HEAD: 91f9a24ed26574d7241e732b87fe4135cfc193e5
- Working tree: dirty
- Tracked modifications: lib/commercial-items-security-catalog.test.ts, next-env.d.ts
- Untracked material includes artifacts, supplier/material reconciliation scripts, migrations, lib/supabase/types 2.ts, and (at the time of this reconciliation) this context document before it was committed
- .next*, .tmp, node_modules, artifacts and generated files materially affect local runtime but are not source architecture
Runtime
- Node: 22.22.2
- npm: 11.x
- Next.js: 16.3.3
- React: 19.2.4
- TypeScript: 5.9.2
- Supabase JS: 2.98.0
- Supabase SSR: 0.8.0
- Supabase CLI: 2.100.0
- Vitest: 4.1.7
- Playwright: 1.61.1
- ESLint: 9.39.3
- Tailwind CSS 4
- PDF.js, pdf-lib, Sharp, ExcelJS and TUS upload support
Important configuration:
- next.config.ts
- proxy.ts
- lib/supabase/middleware.ts
- lib/supabase/server.ts
- lib/supabase/client.ts
- lib/supabase/env.ts
- tsconfig.json
- tsconfig.build.json
- package.json
- package-lock.json
Environment variables identify these subsystems:
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase browser/server access
- NEXT_PUBLIC_SITE_URL: public callback/site URL
- OPENAI_API_KEY, model variables: OpenAI workflows
- ANTHROPIC_API_KEY, model variables: Anthropic workflows
- XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_TOKEN_ENCRYPTION_KEY, XERO_SCOPES: Xero OAuth and encrypted tokens
- CRON_SECRET: scheduled route protection
- TRADESSTACK_ENABLED_BACKGROUND_JOBS: worker enablement
- OPPORTUNITY_CREATION_MODE: opportunity lifecycle rollout
- test credentials: hosted/local E2E only
proxy.ts authenticates requests through Supabase SSR, redirects authenticated users away from login/register, and resolves legacy project-slug aliases.
D. End-to-End Construction Workflow
Actual lifecycle
Organization
  ├── Clients / Contacts / Suppliers
  └── Opportunity
       ├── Tender files / drawings / specifications
       ├── Drawing sets
       │    └── PDF pages
       │         └── Takeoff calibration + measurements
       ├── Pricing workbook
       ├── Scope / trade pack / specification intelligence
       └── Opportunity quote series
              └── quote revision / publication
                     └── award
                           ├── promotion path: same workspace/project identity
                           └── legacy conversion: new delivery project + lineage
                                  ├── Project quote / pricing continuation
                                  ├── Procurement / purchase orders
                                  ├── Variations
                                  ├── Supplier invoices / actual costs
                                  ├── Claims / retention / accounting revisions
                                  ├── QA definitions / runs / evidence
                                  ├── Tasks / issues / defects
                                  └── Xero synchronization
Stage-by-stage reality
Stage	User	Screen	Creates	Authority	Next step
Tender intake	QS/admin	Clients/opportunities	Opportunity, client/contact metadata	organization_opportunities	Attach files/drawings
Drawing review	QS/estimator	Opportunity files, drawing intelligence	Drawing set/pages	project_drawing_sets, takeoff_pages	Open takeoff
Takeoff	QS/estimator	Measure/quantities	Calibration, geometry, measurement	takeoff_measurements plus geometry tables	Publish to commercial destination
Estimate	QS	Pricing worksheet	Workbook/sheets/cells/formulas	opportunity_pricing_worksheets and sheets	Create quote
Quote	QS/commercial user	Opportunity quote	Quote and lines/revision	Opportunity/project quote tables, lines and commercial lineage	Send/revise/award
Award	Authorized commercial user	Opportunity conversion	Award record, project mapping, carry-through	Lifecycle RPCs and award pricing manifest	Project workspace
Project setup	PM/admin	Project dashboard/preconstruction	Members, pricing continuation, commercial context	organization_projects, project relations	Procurement/delivery
Procurement	PM/QS	Purchase orders	PO and lines	project_purchase_orders, lines	Supplier invoice matching
Delivery	PM/site team	Job management	Tasks, timesheets, issues, QA runs	Project operational tables	Claims/closeout
Variation	PM/QS	Variations	Variation, lines, pricing worksheet	project_variations, lines, commercial items	Client approval/claim
QA	PM/site team	Quality assurance	Definition, run, responses, evidence, sign-off	New project_qa_* tables	Completion/handover
Financial close	Accounts/QS	Claims, retention, supplier invoices	Claims, accounting revisions, sync jobs	Immutable accounting records and provider links	Xero/payment reconciliation


The ideal construction lifecycle is only partly connected. Award carry-through, commercial lineage and document continuity are current architectural work. Legacy conversion may copy drawing metadata/storage after the award transaction and does not clone the full takeoff graph. Shared document workspaces are a newer continuity mechanism.
E. Module Catalogue
Module	Main routes	Main code/data	Maturity
Authentication/tenancy	/login, /register, /join, /app/*	Supabase Auth, middleware, organization_members	Actively integrated
CRM	/leads-clients/clients/*	organization_clients, contacts, notes, files	Actively integrated
Opportunities	/leads-clients/opportunities/*	Opportunity lifecycle RPCs, quote series, promotion/conversion	Transitional but actively integrated
Takeoff	Opportunity /takeoff, /takeoff/measure, /takeoff/quantities	PDF.js, takeoff_pages, calibrations, geometry tables	Actively integrated; performance-sensitive
Pricing	Opportunity/project pricing worksheet routes	Workbook/sheet APIs, formulas, AI edit jobs	Actively integrated; very large subsystem
Quotes	Opportunity and project quote routes	Quote series, revisions, lines, commercial publication	Actively integrated with historical paths
Projects	/projects/[projectId]/*	organization_projects, project members, dashboards	Actively integrated
Procurement	Project preconstruction POs	POs, lines, assignments, commitments	Actively integrated
Variations	Project preconstruction variations	Variations, lines, worksheet publication	Actively integrated
Claims/retention	Claims and retention routes	Claims, revisions, retention snapshots and ledgers	Actively integrated, historically layered
Supplier invoices	Company invoice workspace	Capture, extraction, matching, approval, Xero	Actively integrated; complex
QA	Project quality-assurance routes	New QA engine plus older quality tables	Current and legacy overlap
Tasks/todos	Project job-management todos	project_job_todos, attachments/activity	Actively integrated
Issues/defects	QA board and quality issue tables	project_quality_issues, comments, photos	Older field-quality path
Safety	Project site-safety routes	Mostly placeholder route shells	Incomplete implementation
Files	Project/opportunity Files routes	Versioned document workspace/storage	Current candidate path; working-tree caveat
Integrations	Settings integrations, Xero API	OAuth, encrypted tokens, sync jobs	Actively integrated
AI/chat	/api/chat, /api/ai/*, internal routes	AI interactions, usage, memory, review queues	Actively integrated
Universal learning	Company/internal intelligence routes	Events, classifications, evidence pools, memory	Advanced internal subsystem


F. Opportunity / Estimating / Award Architecture
The opportunity is the pre-contract commercial workspace.
Confirmed components:
- client/contact linkage
- tender/project metadata
- opportunity status/lifecycle
- drawing sets and files
- takeoff
- pricing worksheets
- scope builder
- specification/finish analysis
- trade packs
- opportunity quote series
- quote revisions
- award/conversion
The award architecture has two strategies:
1. Promotion: the opportunity workspace/project identity becomes the final project.
2. Legacy conversion: a final delivery project is created and selected commercial/drawing/file information is transferred or relinked.
The award path is serialized through lifecycle RPCs and guarded by permission checks. Migrations in August 2026 add:
- award pricing foundation
- atomic pricing carry-through
- quote publication authority
- reconciliation ledger
- project quote revision creation
- project pricing worksheet continuations
- commercial history attachment
- legacy reconciliation
Estimator knowledge is now carried forward more than in the original architecture, but not perfectly:
- sold quote lines and commercial items can survive;
- source workbook/version and award manifest can be preserved;
- project pricing continuations record source workbook identity/version;
- quote line provenance references opportunity quotes and source line items;
- commercial lineage edges connect items to quotes, variations, takeoff and supplier prices;
- takeoff graph continuity is incomplete under legacy conversion;
- clarifications, exclusions and all tender context are not guaranteed to become a fully navigable PM execution brief.
This is a confirmed architecture gap, not evidence that the system lacks commercial carry-through entirely.
G. Takeoff Architecture
Primary routes:
- app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx
- app/app/(editor)/leads-clients/opportunities/[opportunityId]/takeoff/measure/page.tsx
- app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/quantities/page.tsx
The project editor route exists in the repository, but architecture documentation states that the canonical user-facing Takeoff flow remains opportunity-addressed and resolves the relevant workspace/project internally. Do not assume every project has an independent Takeoff UI.
Data flow:
Drawing set
  → source PDF in project drawing storage
  → takeoff_pages
  → PDF.js viewer/canvas
  → calibration
  → normalized points/paths/area shapes
  → takeoff_measurements
  → quantities summary
  → commercial publication RPC
  → commercial_items / quote / PO / variation
Important tables:
- project_drawing_sets
- takeoff_pages
- takeoff_render_jobs
- takeoff_calibrations
- takeoff_measurements
- takeoff_measurement_points
- takeoff_measurement_groups
- takeoff_measurement_line_paths
- takeoff_measurement_line_path_points
- takeoff_measurement_area_shapes
- takeoff_measurement_area_shape_points
The viewer uses normalized geometry, page coordinate systems, calibration units, page-specific loading, signed URLs and PDF.js. Measurement types include point/count, line/length and area/shape concepts.
Performance protections include:
- bounded Supabase/PDF timeouts;
- page metadata render jobs;
- no full-PDF parsing on normal navigation where avoidable;
- neighbour page prefetch after selected page usability;
- selected-page initial projection;
- all-page quantity hydration rather than per-page query fanout;
- lazy pdf-lib export;
- route prefetch suppression for heavy menu links;
- fallback for stale/cross-drawing page identifiers;
- optimistic/interactive overlay state with explicit save paths.
DO NOT BREAK:
- normalized geometry and calibration units;
- drawing-set/project/organization authorization;
- signed private drawing URLs;
- page/render-job idempotency;
- source measurement lineage when publishing commercially;
- the fallback path for incomplete preparation/rendering.
H. Commercial Architecture
The central model is not a single quote table. It is a semantic commercial layer.
The commercial chain is:
Takeoff / workbook / manual input
  → commercial_items
  → quote / purchase order / variation lines
  → cost items and lineage
  → claims, supplier invoices, actual costs and accounting
commercial_items preserve shared commercial meaning across destinations. They carry organization/project context, quantity/unit/rate/amount-like values, source links, source ranges/versions and links to variations, quotes, POs, takeoff or materials.
commercial_lineage_edges make relationships explicit between:
- commercial items
- material supplier prices
- takeoff measurements
- quotes and quote lines
- variations and variation lines
- purchase orders and PO lines
The intended authority is:
- worksheet = estimating source/workbook;
- commercial item = structured commercial semantic item;
- quote = client-facing offer snapshot;
- purchase order = supplier commitment;
- variation = post-award commercial change;
- cost item = canonical cost/commercial classification;
- accounting revision = immutable accounting evidence;
- Xero = external accounting execution/status authority for provider-side records.
Copies are not interchangeable with references:
- quote revisions copy lines while preserving predecessor/source identifiers;
- project pricing continuations create new workbook identity with source workbook/version;
- publication creates destination-specific snapshots;
- lineage edges preserve source relationships;
- award finalization locks tender evidence;
- later edits should not silently mutate historical quote/award evidence.
Construction distinction:
- estimate = internal build-up of cost, quantities, labour, materials, risk and markup;
- quote = external offer to the client;
- contract value = accepted commercial basis;
- variation = approved change after award;
- PO = commitment to a supplier/subcontractor, not a client invoice.
I. Quotes and Revisions
There are opportunity and project quote paths.
Opportunity quotes use:
- opportunity_quotes
- opportunity_quote_series
- quote lines
- commercial publication and PDF logic
Project quotes use:
- project_quotes
- project_quote_line_items
- revision creation and project pricing continuation
A project quote revision is a successor/copy model, not an in-place version field only. The migration 20260819160000_add_project_quote_revision_creation.sql:
- calculates the next revision number;
- creates a deterministic successor identity;
- records predecessor quote;
- copies lines;
- preserves source opportunity quote identifiers;
- attaches commercial history;
- creates a project-working pricing continuation;
- retains source workbook/version/award manifest information.
Awarded quote evidence becomes immutable when award completes according to docs/architecture/opportunity-award-pricing-lifecycle.md.
Status and acceptance authority are distributed across quote records, publication RPCs and award lifecycle functions. Future work must inspect the specific quote type and publication path before changing status behavior.
J. Projects and Delivery
A project is the delivery workspace after award or direct project creation.
Important routes:
- /projects/[projectId]/dashboard
- /projects/[projectId]/financials
- /projects/[projectId]/job-management
- /projects/[projectId]/preconstruction
- /projects/[projectId]/files
- /projects/[projectId]/drawing-intelligence
- /projects/[projectId]/takeoff
- /projects/[projectId]/trade-packs
- /projects/[projectId]/ai-chatbot
- /projects/[projectId]/site-safety
Project navigation groups:
- dashboard
- preconstruction/commercial
- job management
- quality assurance
- tasks/todos
- time sheets
- financials
- files/drawings
- safety
- reporting/AI
Likely daily use:
- PM: dashboard, procurement, variations, financials, QA planning, project files.
- QS: pricing continuation, project quote revisions, variations, cost/claim awareness.
- Site manager/foreman: drawings, QA runs, evidence, issues, tasks and sign-offs.
- Accounts/admin: supplier invoices, claims, retention, Xero, contacts and organization settings.
The major break is that not all tender knowledge is presented as a single delivery handover. Commercial lineage exists, but tender files, takeoff graph, scope assumptions and QA planning are not fully unified into one automatic project execution model.
K. Procurement / Purchase Orders
Main entities:
- organization_suppliers
- project_purchase_orders
- project_purchase_order_line_items
- PO assignments
- PO attachments/activity
- commitment release tables
- supplier invoice matching tables
PO data can originate from:
- manual entry;
- commercial items;
- takeoff publication;
- pricing worksheet-derived lines.
The canonical current direction is commercial-item-backed publication. Takeoff-specific atomic publication RPCs include:
- publish_takeoff_commercial_purchase_order_v1
POs support line items, numbering, statuses, assignments and commitment relationships. Supplier invoice matching uses PO and PO-line references, but a supplier invoice can also require allocation to cost items or project costs.
Xero handles external accounting bills and provider-side state. TradesStack retains internal PO/commitment and supplier-invoice semantics.
L. Variations
Variation entities:
- project_variations
- project_variation_line_items
- variation attachments
- variation pricing worksheet
- commercial items and lineage edges
- claim/invoice relationships
Current flow:
Project change identified
  → variation draft
  → pricing worksheet/commercial items
  → priced/sent/client-review state
  → approved/rejected
  → claim/invoice/accounting downstream
Takeoff publication has an atomic path:
- publish_takeoff_commercial_variation_v1
A variation is used when the scope or value changes after award. Editing the original contract quote would destroy the historical distinction between tendered work and post-award change.
Variation drafts can be appended to or saved through RPCs. Status and financial effects must be mediated through the current variation publication and accounting paths.
M. QA / Quality Architecture
TradesStack contains two quality generations.
Older quality subsystem
Tables include:
- project_quality_issues
- project_quality_inspections
- project_quality_inspection_items
- project_quality_photos
- project_quality_sign_offs
- project_quality_work_proofs
- issue comments/activity
- inspection/sign-off activity
The older system is a field-quality/inspection model with issues, photos, work proof and sign-offs. It remains present and is used by ProjectQualityAssuranceBoard.
Current QA engine
The newer system uses:
- qa_templates
- qa_template_sections
- qa_template_fields
- qa_template_field_options
- project_qas
- project_qa_sections
- project_qa_fields
- project_qa_field_options
- project_qa_runs
- project_qa_responses
- project_qa_response_evidence
- project_qa_hold_releases
- project_qa_signoffs
- signature/evidence upload records
Definition flow:
Company QA template
  → project QA definition
  → project-specific sections/fields/criteria
  → ready lifecycle
  → QA run
  → responses
  → evidence/photos/measurements
  → hold-point release
  → sign-off
  → completion/cancellation
The current engine explicitly supports:
- field types and options;
- measurement validation;
- required evidence;
- on-failure evidence;
- evidence storage metadata;
- hold-point release;
- signatures;
- definition snapshots;
- definition snapshot hashes;
- lock versions;
- optimistic concurrency;
- immutable completed evidence/signatures.
Relevant code:
- lib/quality-assurance/definitions/server.ts
- lib/quality-assurance/definitions/actions.ts
- lib/quality-assurance/execution/server.ts
- lib/quality-assurance/execution/actions.ts
- components/app/quality-assurance/*
The newer QA engine appears canonical for new structured QA work. The older issue/inspection system remains a separate operational path and is not fully integrated with the newer engine. Failed QA does not universally generate a task/defect automatically; issue and todo linkage exists in parts of the older model, but the relationship is not a single universal rule.
N. Tasks / Issues / Defects
Tasks/todos use:
- project_job_todos
- attachments
- activity/comments
- ownership/assignment
- due dates/status
- project relationships
Older QA defects/issues use:
- project_quality_issues
- comments
- activity
- issue photos
- inspection relationships
- work proof
This produces legacy/current overlap:
Task/todo
├── general assigned project action
└── QA-linked task relationship where supported

Issue/defect
├── older quality non-conformance record
└── may have photos, comments and rectification evidence
There is no proof that every failed new QA response automatically creates a canonical project task or defect. Rectification tracking is therefore split between QA issues, work proof and general todos.
O. Financial Architecture
Commercial value flow
Estimate/workbook cost
  → sell price / markup
  → quote
  → awarded contract basis
  → approved variations
  → revised commercial value
  → payment claim / invoice
Cost flow
Estimate/material/labour basis
  → purchase orders and commitments
  → supplier invoices
  → allocations / cost items
  → actual cost events
  → accounting/Xero
Financial features include:
- worksheets and rates;
- markup/sell values;
- commercial items;
- purchase orders and commitments;
- variations;
- supplier invoices;
- actual cost events;
- payment claims;
- retention claims and releases;
- immutable accounting documents/revisions;
- cost codes and accounting mappings;
- Xero bills and sales invoices.
Some forecast/profitability concepts exist through project cost reporting and projections, but the repository does not establish one universal all-project earned-value model. Mark uncertain financial authority as AMBIGUOUS until the relevant report/service is traced.
P. Files / Drawings / Evidence
The newer shared document subsystem uses:
- document_workspaces
- document_workspace_entities
- document_nodes
- document_versions
- document activity/cleanup/reconciliation tables
- private bucket organization-documents
Properties:
- immutable version identities;
- opaque storage keys;
- private access;
- signed download URLs;
- MIME allowlist;
- 2 GiB object limit;
- upload reservation/completion/abandonment;
- verification and cleanup lifecycle;
- soft deletion and reconciliation.
Routes:
- /projects/[projectId]/files
- /leads-clients/opportunities/[opportunityId]/files
- upload/download APIs under /api/documents/*
Legacy drawing storage remains separate under project drawing-set paths. QA evidence also has domain-specific tables and storage paths. Do not consolidate all files into the Files workspace without preserving drawing/QA semantics.
Tracking status: the shared Files foundation (lib/documents) and the project/opportunity/client Files routes are tracked and committed in git as of HEAD 91f9a24; there are no untracked files under lib/documents. Earlier versions of this document warned that this subsystem existed only in an untracked working tree; that warning is no longer accurate. Deployment state is still unverified: committed code does not prove the subsystem is migrated, deployed or exercised in a live environment, and not every legacy drawing/attachment is contained in the shared Files workspace.
Q. Integrations / Xero
Xero architecture includes:
- OAuth connect/callback routes;
- organization-scoped connection;
- encrypted token set;
- OAuth state records;
- tenant selection;
- accounting tax rates;
- sync jobs;
- provider contact links;
- bills;
- sales invoices;
- attachments;
- status/payment refresh;
- retries and uncertain-outcome handling.
Relevant tables:
- organization_xero_connections
- organization_xero_connection_secrets
- organization_xero_oauth_states
- organization_accounting_sync_jobs
- organization_xero_contacts
- accounting documents, revisions, events and remote observations
Xero is not the source of truth for TradesStack commercial meaning. TradesStack owns its quote, PO, variation, supplier invoice, claim and cost semantics. Xero becomes authoritative for provider-side accounting objects and status after synchronization.
Secrets are stored through encrypted server-side structures. Never expose tokens or credentials to browser code.
R. AI Architecture
Providers:
- OpenAI
- Anthropic
AI entry points include:
- /api/chat
- /api/ai/interactions/review
- pricing worksheet edit assistant jobs
- worksheet scaffold preview
- scope builder
- trade-pack/specification classification
- supplier/material document interpretation
- change detection
- Universal Construction Learning
- organization memory synthesis
Typical flow:
User request
  → authenticated route/server service
  → organization/project/workbook context
  → provider/model
  → structured or validated response
  → AI interaction/usage record
  → human review or explicit apply
  → operational mutation
  → intelligence/correction/provenance event
Chat uses:
- ai_chat_conversations
- ai_chat_messages
- ai_chat_usage
- quota reservation/commit/release RPCs
Other AI work uses:
- ai_interactions
- validation cases
- intelligence events
- correction events
- learning review queues
- organization memory
- evidence/semantic pools
The architecture explicitly states that relational operational tables remain canonical. AI should suggest, classify, summarize or prepare a mutation; it must not silently become the authority for financial, QA or commercial records.
S. Database Architecture
Conceptual domains:
Identity/tenancy
- organizations
- organization_members
- roles, permission tables, overrides, invitations
CRM/opportunities
- organization_clients
- contacts/locations/notes
- organization_opportunities
- opportunity lifecycle and quote series
Projects
- organization_projects
- project members
- project aliases
- project metadata
Drawings/takeoff
- drawing sets/pages
- render jobs
- calibrations
- measurements and geometry tables
Commercial
- worksheets/sheets
- commercial_items
- quotes/quote lines
- variations/variation lines
- commercial_lineage_edges
- cost_items
- cost codes/mappings
Procurement
- suppliers
- purchase orders/lines
- assignments
- commitments/releases
- supplier invoices and allocation tables
QA
- templates
- definitions
- runs/responses
- evidence
- hold releases
- sign-offs
- older quality issue/inspection tables
Files/evidence
- document workspaces/nodes/versions
- QA evidence
- drawing storage metadata
- accounting attachments
Financials
- claims/claim lines
- retention schedules/claims/allocations
- accounting documents/revisions/attempts/events
- actual costs and projections
Integrations
- Xero connections, secrets, tenants, contacts, sync jobs
AI/audit
- AI interactions/chat/usage
- intelligence events
- validation/correction events
- memory and learning queues/pools/review runs
The generated schema (lib/supabase/types.ts, reconciled at HEAD 91f9a24) indicates 276 current public tables, 605 public functions and 14 public views. The supabase/migrations directory contains 507 .sql migration files. Migration-file count and generated types are separate evidence from applied/deployed schema state: the presence of a migration file does not prove that it has been applied to any environment. Exact live authority must be confirmed from the current applied schema/migration sequence, not filename naming or file counts alone. Enum count was not confirmed during reconciliation and should be verified from the live schema.
T. Supabase / Security / Tenancy
Security is layered:
1. UI hides/disables controls.
2. Server components/actions check membership and permissions.
3. RPCs enforce mutations and transitions.
4. RLS enforces row visibility.
5. Storage policies enforce object access.
6. SECURITY DEFINER functions provide controlled privileged operations.
Key helpers:
- createBrowserSupabaseClient
- createServerSupabaseClient
- getCurrentOrganizationMember
- hasOrganizationPermission
- getOrganizationPermissionsBatch
- isPlatformAdmin
Most domain rows carry organization_id. Many use composite organization foreign keys to prevent cross-tenant references. RLS is frequently enabled and forced. Private files use signed URLs; do not make storage buckets public for convenience.
The service role appears in scripts/workers/server-only paths. It must not enter client components or browser bundles.
U. Permission Architecture
Permissions are defined in app_permissions, assigned through role_permissions, and can be overridden through member-level overrides.
Verified permission keys (grepped from supabase/migrations and lib at HEAD 91f9a24) include:
- leads.clients.write, leads.opportunities.write
- quotes.write
- purchase_orders.write
- variations.write
- suppliers.write
- supplier_invoices.view, supplier_invoices.write, supplier_invoices.capture, supplier_invoices.review, supplier_invoices.accounts_approve, supplier_invoices.site_review, supplier_invoices.submit_site_review
- materials.view, materials.write
- files.view, files.write, files.delete, files.monitor, files.purge
- settings.organization.view, settings.organization.update
- settings.users_permissions.view, settings.users_permissions.manage
- accounting.sales_invoices.view/manage/push, accounting.ap_bills.view/export/retry, accounting.contacts.manage
- retention.view plus retention claims/schedules/variances/cutover/legacy/xero keys
- actual_costs.reverse
- intelligence.restricted.read
Verified naming reality: several commercial domains expose only a write key (leads.clients, leads.opportunities, quotes, purchase_orders, variations, suppliers). Do not assume a matching .view key exists for those domains; read access for them may be enforced by other keys, role checks or RLS. Confirm the actual key set in the live permission catalog before gating UI or server logic on one.
Example matrix:
Domain	Read	Write/admin	Enforced by
CRM	Role/RLS-driven; no verified leads.clients.view key	leads.clients.write, leads.opportunities.write	Server + RPC/RLS
Quotes	Role/RLS-driven; no verified quotes.view key	quotes.write	Server + publication RPCs/RLS
POs	Role/RLS-driven; no verified purchase_orders.view key	purchase_orders.write	Server + RPC/RLS
Variations	Role/RLS-driven; no verified variations.view key	variations.write	Server + atomic save/publication RPCs
Files	files.view	files.write, files.delete, files.monitor, files.purge	Server + storage/document policies
Materials	materials.view	materials.write	Server + RLS/RPCs
Supplier invoices	supplier_invoices.view	write/capture/review/accounts_approve	Server + finance RPCs/RLS
Accounting	accounting.sales_invoices.view, accounting.ap_bills.view	manage/push, export/retry	RPCs, RLS, workers
Settings	settings.organization.view	settings.organization.update	Server + RLS
Users	settings.users_permissions.view	settings.users_permissions.manage	Owner/admin checks
Intelligence	ordinary scoped access	intelligence.restricted.read	RPCs/RLS/internal routes


UI checks are convenience. True security must remain in server/database/storage enforcement.
V. UI / Design System
The product uses a dense business application style:
- dark branded shell in places;
- orange accent (#F74917 appears in public UI);
- locally loaded fonts wired through lib/fonts.ts and next/font/local: Inter woff2 is loaded twice, exported as mulishBody (--font-body) and mulishHeading (--font-heading), so body and headings both resolve to Inter despite the export names; Akzidenz-Grotesk and IBM Plex Sans are also registered for heading/display and settings use;
- @fontsource/inter and @fontsource/mulish remain installed in package.json but are not imported anywhere; tailwind.config.ts still names Manrope/Sora, which are not wired into the app;
- compact tables and workspaces;
- drawers/dialogs for contextual editing;
- tabs and project navigation;
- status badges/pills;
- dense spreadsheet-like editing;
- responsive adaptations for field/mobile use;
- explicit loading/error states;
- router refresh or server revalidation after mutations.
Representative current screens:
- PricingWorksheetBoard
- TakeoffPdfViewer
- ProjectDashboardBoard
- CompanySupplierInvoicesWorkspace
- ProjectQualityAssuranceBoard
- FilesWorkspace
Prefer shared primitives and current route-shell patterns. Older duplicate-suffixed files in _archive or files named route 2.ts, page 2.tsx are evolution evidence, not templates.
W. State Management / Data Fetching
Preferred patterns vary by workload:
- Server Components load initial authorized data.
- Server actions perform validated mutations and call revalidatePath.
- Route handlers serve dynamic/no-store APIs.
- Supabase browser client is used for interactive legacy workspaces where appropriate.
- React cache() deduplicates request-scoped server reads.
- Promise.all parallelizes independent queries.
- Client transitions provide pending states.
- router.refresh() updates server-backed UI after writes.
- sessionStorage supports idempotent creation or selected-workbook persistence.
- localStorage stores sidebar preferences.
- URL state identifies projects, drawing sets, pages and overlays.
The preferred new-work pattern is:
Server Component/action
  → server Supabase client
  → membership + permission
  → typed validation
  → RPC or scoped mutation
  → revalidatePath/router refresh
Use direct browser Supabase writes only when the existing module demonstrably uses that pattern and security is still enforced by RLS/RPC.
X. Performance and Resilience
Performance-sensitive areas:
- pricing worksheet grid;
- takeoff/PDF rendering;
- supplier invoice workspace;
- project dashboards;
- accounting/claim reports;
- signed URL generation;
- large geometry/evidence sets;
- AI and document interpretation jobs.
Intentional optimizations include:
- request caching;
- parallel queries;
- aggregate/read-model RPCs;
- bounded timeouts;
- pagination;
- background render jobs;
- resumable TUS upload;
- lazy PDF/export imports;
- neighbour-page warmup;
- no-store dynamic APIs;
- queue leasing and retry state;
- idempotency keys;
- reconciliation scripts.
Resilience patterns include:
- validation before writes;
- stale lock-version rejection;
- immutable snapshots;
- explicit failed/abandoned states;
- Xero uncertain-outcome handling;
- cleanup leases;
- retry/dead-letter queues;
- fallback data paths;
- unauthorized redirect behavior;
- visible failed render/preparation states.
Y. Auditability / Immutability / Revisions
Strong historical mechanisms exist in:
- quote revisions;
- award pricing manifests;
- commercial lineage;
- QA definition/run snapshots;
- QA evidence/signatures;
- accounting revisions;
- retention payment evidence;
- material supplier price/tax facts;
- Xero sync attempts;
- intelligence events and corrections.
Examples:
- quote revisions preserve predecessor/source identifiers;
- QA runs store definition snapshot/version/hash;
- QA responses use lock versions;
- completed accounting evidence is immutable;
- accounting evidence includes hashes and append-only events;
- material price/tax facts have immutable triggers;
- accounting attempts use idempotency and response evidence;
- queue workers use leases and retry states.
Historical records should be superseded or revised, not silently overwritten.
Z. Test Architecture
Testing includes:
- Vitest unit/service tests;
- React Testing Library/component tests;
- migration characterization tests;
- route-handler tests;
- contract/source-shape tests;
- Playwright E2E tests;
- hosted/local fixture scripts;
- reconciliation and audit scripts.
Important test-heavy areas:
- commercial item security/lineage;
- opportunity award/conversion;
- takeoff;
- pricing worksheet formulas/AI edits;
- QA concurrency/evidence/signatures;
- supplier invoices;
- payment claims/retention;
- Xero services;
- document storage;
- permissions.
Normal commands:
npm run lint
npm run build
npx vitest run
npm run test:e2e:local
For focused work, run the relevant route/service/migration tests rather than relying only on a whole-site build.
AA. Legacy vs Current Architecture
Concept	Current path	Older path	Guidance
QA	qa_templates, project_qas, runs/responses/evidence/hold releases/signatures	project_quality_* issues/inspections/photos/sign-offs	Extend current QA for new structured QA; preserve older data/path
Opportunity conversion	Lifecycle strategy, promotion, atomic award pricing	Legacy two-project conversion and post-commit drawing clone	Inspect lifecycle policy; do not assume one strategy
Files	Shared document workspace/version subsystem	Drawing attachments, trade-pack files and domain registries	Reuse shared Files for general documents; retain domain-specific semantics
Quotes	Quote series, commercial publication, revisions	Older opportunity/project quote variants	Preserve source/provenance; inspect canonical route
Cost classification	cost_items, cost codes and mapping	Older classification/mirror concepts	Use current CostItem semantics; do not resurrect retired mirrors
Accounting	Immutable accounting revisions and provider jobs	Earlier direct Xero/document flows	Use revisioned/queued accounting boundaries
Takeoff	Multi-drawing metadata, render jobs, normalized geometry	Earlier single-drawing assumptions	Preserve page/drawing-set ownership and fallbacks
AI	Interaction/validation/events/memory	Direct model calls in older routes	Add provenance/validation; do not create untracked AI mutations


AB. Source-of-Truth Matrix
Concept	Canonical representation	Database authority	Main code authority	Copy/snapshot behavior
Organization	Organization tenant	organizations	membership/server helpers	Referenced by all domains
Member	Organization membership	organization_members	projects-server, permissions	Role/override evaluation
Client	CRM client	organization_clients	leads/clients services	Linked into projects/quotes
Opportunity	Tender workspace	organization_opportunities	lifecycle/conversion services	May promote or convert
Project	Delivery workspace	organization_projects	project workspace services	Final project may be promoted or newly created
Drawing	Drawing set/page	project_drawing_sets, takeoff_pages	drawing/takeoff services	Legacy conversion may copy metadata/storage
Measurement	Geometry-backed quantity	takeoff_measurements + geometry tables	lib/takeoff-server.ts	Publishes commercial snapshot/lineage
Worksheet	Workbook/sheets	opportunity_pricing_worksheets and sheets	pricing worksheet services	Project continuation records source/version
Commercial item	Shared priced semantic line	commercial_items	commercial-item services/RPCs	Linked/snapshotted into documents
Quote	External offer	opportunity/project quote tables	quote publication/revision services	Revisions copy lines and preserve predecessor
PO	Supplier commitment	project PO tables	procurement services	Lines may originate from commercial items
Variation	Post-award change	variation tables	variation publication/save RPCs	Own pricing/snapshot lineage
QA template	Company reusable definition	qa_templates family	QA definition actions	Duplicated into project definition
QA definition	Project requirement	project_qas family	QA definition server/actions	Versioned, copied from template
QA record	Executed check	project_qa_runs/responses	QA execution server/actions	Definition snapshot is retained
Evidence	Uploaded/linked proof	QA evidence/document records	upload/evidence services	Completion/signature immutability
Signature	QA attestation	QA sign-off/signature tables	signature finalization RPCs	Immutable final evidence
Task	Assigned action	project_job_todos	todo services	May link to issues/QA
Issue	Older quality problem	project_quality_issues	quality board/services	Photos/comments/work proof
Invoice/cost	Supplier/accounting records	supplier invoice, cost, accounting tables	invoice/Xero services	Revisions/snapshots where financial


AC. Dependency Map
ORGANIZATION
├── Members / Roles / Permissions
├── Clients / Contacts
│   └── Opportunities
│       ├── Files / Drawings / Specifications
│       │   └── Takeoff pages / calibration / measurements
│       ├── Pricing workbooks
│       ├── Scope / trade packs / spec intelligence
│       └── Opportunity quote series
│           └── Award / conversion
│               ├── Project
│               │   ├── Project quote / pricing continuation
│               │   ├── Purchase orders
│               │   │   └── Supplier invoices / actual costs
│               │   ├── Variations
│               │   ├── Claims / retention / accounting
│               │   ├── QA templates → project definitions → runs
│               │   ├── Tasks / issues / defects
│               │   ├── Files / drawings / evidence
│               │   └── Xero
│               └── Commercial lineage / award evidence
└── Suppliers / Materials / Cost Codes
    ├── Pricing
    ├── Procurement
    ├── Supplier invoices
    └── Accounting mappings
AD. Critical Invariants — DO NOT BREAK THESE
1. Every tenant-owned operation must preserve organization_id isolation.
   Enforced by membership checks, composite FKs, RLS and RPCs. Cross-tenant leakage is a security failure.
2. Server/database permissions are authoritative.
   UI hiding is insufficient. Preserve has_org_permission, RPC and RLS checks.
3. AI is never the operational source of truth.
   AI output requires validation, review or explicit application where appropriate.
4. Awarded quote and pricing evidence must not be overwritten.
   Award pricing, quote revisions and predecessor links are historical truth.
5. Commercial provenance must survive copying.
   Preserve source workbook, source quote, source line, source range, source version and lineage edges.
6. Takeoff geometry must remain normalized and calibrated.
   Do not replace stored geometry with screen pixels or silently change coordinate systems.
7. Completed QA/accounting evidence must remain immutable.
   Use revisions, supersession or corrective records rather than mutation/deletion.
8. QA completion must respect hold points and evidence requirements.
   Do not bypass database-enforced readiness rules in UI code.
9. Private storage must remain private.
   Use signed URLs and authorized download APIs.
10. Xero connections are organization-scoped and secrets are server-only.
11. Queue jobs must be idempotent and retry-safe.
       Preserve idempotency keys, leases, retry states and uncertain-outcome handling.
12. Do not assume one opportunity-conversion strategy.
       Promotion and legacy conversion coexist.
13. Do not collapse the newer QA engine into the older quality tables without an explicit migration plan.
14. Do not create parallel commercial concepts.
       Search commercial_items, CostItems, existing publication RPCs and lineage before adding tables.
AE. How to Work Safely in TradesStack
Before modifying:
1. Identify the owning organization/project/opportunity boundary.
2. Search for existing tables, RPCs, actions, routes and shared components.
3. Trace UI → action/route → validation → permission → RPC/query → database constraints.
4. Determine the canonical source-of-truth table.
5. Determine whether the operation creates a reference, copy, snapshot or revision.
6. Check existing migration and characterization tests.
7. Inspect current and legacy paths.
8. Preserve provenance, idempotency and historical evidence.
9. Reuse current UI shells, tables, drawers, dialogs and status patterns.
10. Run focused tests plus lint/type/build checks proportionate to risk.
Conventions:
- Use PascalCase React components and kebab/route-group filesystem conventions already present.
- Keep server-only code in server modules and use server-only where appropriate.
- Use createServerSupabaseClient for server operations.
- Validate input before writes.
- Use revalidatePath or the established refresh pattern.
- Prefer existing RPCs for atomic/status-sensitive mutations.
- Do not place service-role credentials in client code.
- Use private storage and signed download routes.
- Add forward migrations; never edit applied migrations.
- Use domain terminology consistently: quote, variation, PO, commercial item, QA definition, QA run.
- Prefer current QA, Files, commercial lineage and accounting revision patterns for new work.
AF. Construction Domain Handbook
- A tender is the pre-award request for price, drawings and specifications.
- An estimate is the internal build-up of quantities, labour, materials, subcontractors, overheads, risk and margin.
- A quote is the external offer issued to the client/main contractor.
- A takeoff quantifies work from drawings; it is not itself a price.
- Scope defines what is included, excluded and qualified in the trade package.
- Award means the subcontractor has been selected or the work has become contractually active.
- Procurement turns the sold work into supplier/subcontractor commitments.
- A purchase order commits the subcontractor to a supplier; it is not the same as a client invoice.
- A variation changes contracted scope, price or time after award.
- QA records evidence that installed work meets requirements.
- A hold point prevents progression or completion until a responsible person verifies/release it.
- A defect is non-compliant work; rectification is the correction.
- Practical completion is the point where the trade work is substantially complete subject to outstanding items.
- Handover transfers records, evidence, warranties and completion information.
- Progress claims seek payment for completed contract work.
- Retention is money withheld under contract until later release conditions.
- Evidence can include photos, measurements, documents, signatures and accounting snapshots.
TradesStack strongly supports tendering, estimating, commercial publication, procurement, QA evidence and accounting workflow. It does not yet prove a fully automatic tender-to-QA planning engine or universal defect-to-task generation.
AG. Persona Walkthroughs
Estimator/QS
Client/opportunity
→ tender drawings/files
→ drawing intelligence
→ takeoff calibration and measurements
→ pricing worksheet
→ scope/clarifications
→ quote and revisions
→ award
The break is that some tender knowledge is preserved through commercial lineage and source manifests, while other context still requires manual project-team interpretation.
Project manager
Project
→ project quote/pricing continuation
→ procurement and purchase orders
→ variations
→ supplier invoice/cost awareness
→ claims/retention
→ QA definitions and runs
→ closeout evidence
The PM has broad delivery functionality, but not every estimating artefact is automatically surfaced as a delivery plan.
Site manager/foreman
Project
→ drawings/files
→ tasks/todos
→ QA run
→ response/evidence/photos
→ hold-point release
→ sign-off
→ issue/rectification where needed
The older quality board and newer QA engine overlap; the exact path depends on which screen/system is used.
Administrator/accounts
Suppliers
→ supplier invoices
→ PO matching/allocation
→ approvals
→ claims/retention
→ Xero sync/status
→ accounting records
Financial records are heavily protected by permissions, snapshots, immutable revisions and provider-sync evidence.
AH. Important File Map
Area	Important files
Application shell	app/app/layout.tsx, app/app/(workspace)/layout.tsx, app/app/(editor)/layout.tsx
Auth	proxy.ts, lib/supabase/middleware.ts, hooks/use-auth.ts
Tenancy	lib/projects-server.ts, lib/supabase/server.ts
Permissions	lib/permissions-server.ts, permission migrations
Opportunities	lib/leads-clients-server.ts, opportunity routes, lifecycle migrations
Takeoff	lib/takeoff-server.ts, lib/takeoff/page-data-server.ts, components/app/TakeoffPdfViewer.tsx
Pricing	pricing worksheet route/components, lib/pricing-worksheet-*
Quotes	components/app/OpportunityQuoteRevisionEditor.tsx, quote routes, quote migrations
Commercial	commercial_items migrations, lib/commercial-lineage/*
POs	lib/procurement-commercial-server.ts, PO routes and migrations
Variations	variation routes/actions, publication migrations
Projects	lib/projects-server.ts, project layouts/dashboard
QA definitions	lib/quality-assurance/definitions/*
QA execution	lib/quality-assurance/execution/*
Legacy quality	components/app/quality-assurance/ProjectQualityAssuranceBoard.tsx
Files	lib/documents/*, components/app/files/*, document APIs
Xero	lib/xero/*, Xero integration routes
AI	app/api/chat/*, app/api/ai/*, lib/universal-learning/*
Database types	lib/supabase/types.ts
Migrations	supabase/migrations/*
Tests	domain-local *.test.ts/tsx, migration tests, Playwright tests
Architecture docs	docs/architecture/*, docs/intelligence/*, docs/architecture/TRADESSTACK_AI_CONTEXT.md (this document)


AI. Architectural / Workflow Gaps
Architecture gaps
- New QA and older quality systems coexist.
- Shared Files and domain-specific drawing/QA/document registries coexist.
- Opportunity promotion and legacy conversion coexist.
- Opportunity/project quote implementations coexist.
- Project Takeoff routing remains partly opportunity-addressed.
Workflow gaps
- Estimating knowledge is not universally presented as a complete delivery handover.
- QA planning is not proven to be automatically derived from sold scope/takeoff.
- Failed new QA responses do not universally create canonical tasks/defects.
- Tender drawing/takeoff continuity is incomplete under legacy conversion.
Integration gaps
- Xero provider state is asynchronous and requires reconciliation.
- Supplier invoices, PO commitments, cost items and actual costs are connected but not one indistinguishable object.
- Shared Files does not automatically contain every legacy drawing/attachment.
Incomplete implementation
- Site-safety routes exist, but repository evidence indicates several are mostly placeholder shells.
- The shared Files subsystem is committed as of HEAD 91f9a24, but its migration/deployment status and the completeness of legacy attachment backfill remain unverified.
AJ. TradesStack AI Context Pack
Product identity
TradesStack is a multi-tenant construction subcontractor operating platform. It serves specialist trade businesses that tender for work, quantify drawings, price scope, issue quotes, procure materials, manage variations, track costs, record QA evidence and synchronize accounting.
Treat organization_id as a mandatory ownership boundary for every domain object. TradesStack organizations contain members, clients, suppliers, opportunities and projects.
Construction lifecycle
The principal lifecycle is:
Client/tender
→ opportunity
→ drawings/specifications
→ takeoff
→ pricing worksheet
→ scope and quote
→ quote revisions
→ award/conversion
→ project
→ procurement/POs
→ delivery/tasks/timesheets
→ variations
→ supplier invoices/actual costs
→ claims/retention
→ QA/evidence/sign-off
→ handover/reporting/Xero
This lifecycle has current and legacy branches. Opportunity award may promote the existing workspace/project identity or create a final delivery project through legacy conversion.
Technical stack
Use Next.js 16 App Router with React 19 and TypeScript. The backend is Supabase/PostgreSQL using SSR auth, browser/server clients, RLS, SECURITY DEFINER RPCs, triggers, constraints and storage policies. Supabase Storage is private and accessed through signed URLs. The project uses Vitest, React Testing Library, Playwright, ESLint and TypeScript.
Important runtime files:
- proxy.ts
- lib/supabase/middleware.ts
- lib/supabase/server.ts
- lib/supabase/client.ts
- lib/permissions-server.ts
- lib/projects-server.ts
Core domains
- CRM: clients, contacts and notes.
- Opportunities: tender lifecycle and award.
- Drawings/takeoff: PDF pages, calibration, normalized geometry and quantities.
- Pricing: spreadsheet-like workbooks, formulas, materials and AI editing.
- Commercial: commercial_items, quotes, quote lines, variations and lineage.
- Projects: delivery workspace, members and dashboards.
- Procurement: suppliers, POs, commitments and assignments.
- Costs/accounting: supplier invoices, cost items, actual costs, claims, retention and accounting revisions.
- QA: templates, project definitions, runs, responses, evidence, hold points and signatures.
- Legacy quality: issues, inspections, photos, work proof and sign-offs.
- Files: versioned document workspaces and private storage.
- Xero: organization-scoped OAuth and accounting synchronization.
- Intelligence: AI interactions, validation, correction events, organization memory and learning queues.
Source-of-truth rules
Relational business tables remain canonical. AI, memory and intelligence layers assist and observe; they do not replace operational truth.
Use:
- organizations for tenant identity;
- organization_members for membership;
- organization_opportunities for opportunities;
- organization_projects for projects;
- takeoff_measurements plus geometry tables for takeoff;
- opportunity/project worksheet tables for workbook identity;
- commercial_items for structured commercial semantics;
- quote tables for client-facing offers;
- purchase-order tables for supplier commitments;
- variation tables for post-award changes;
- QA template/project/run tables for quality;
- accounting revision tables for immutable financial evidence.
If authority is unclear, mark it ambiguous and trace callers, foreign keys, RPCs and migrations before modifying anything.
Commercial architecture
Commercial items are shared commercial primitives. They may originate in a pricing worksheet, takeoff measurement or manual input and flow into quotes, POs and variations. Preserve source range, source version, source quote/line, takeoff references and lineage edges.
An estimate is an internal build-up. A quote is an external offer. A PO is a supplier commitment. A variation is a post-award change. Do not edit the original contract quote to represent a variation.
Quote revisions are successor/copy records that preserve predecessor and source identifiers. Project pricing continuations preserve source workbook/version and award-manifest context. Awarded pricing evidence must remain historically defensible.
Takeoff architecture
Takeoff uses drawing sets, PDF pages, PDF.js, calibration, normalized geometry and measurement tables. Do not store screen pixels as authoritative geometry. Preserve page coordinate systems, calibration units, drawing-set ownership, organization/project authorization, render-job idempotency and signed private URLs.
Commercial publication from takeoff uses dedicated atomic RPCs for quotes, POs and variations. Preserve measurement provenance when publishing.
QA architecture
The current QA engine uses company templates, project definitions, QA runs, responses, evidence, hold-point releases and signatures. Definitions and runs preserve versions/snapshots. Responses use lock versions for optimistic concurrency. Completed evidence and signatures are intended to be immutable.
Older project_quality_* tables remain in the repository for inspections, issues, photos, work proof and sign-offs. Do not assume the older quality board and current QA engine are interchangeable. New structured QA work should normally extend the current QA engine unless repository evidence requires the legacy system.
Permissions and tenancy
Permissions are defined in app_permissions, assigned through role_permissions and may have member overrides. Server helpers call has_permission, has_org_permission and batch permission RPCs. The database also enforces access with RLS and SECURITY DEFINER functions.
Never rely only on UI hiding. Every mutation requires authenticated membership, organization scope, permission and domain-specific state validation. Keep service-role usage server-only.
UI conventions
TradesStack uses dense construction/business UI:
- project/workspace shells;
- compact tables;
- status badges;
- drawers/dialogs for contextual editing;
- spreadsheet grids;
- server-rendered initial data;
- client transitions for interactive work;
- explicit loading/error states;
- router refresh or path revalidation after writes;
- responsive patterns for desktop and field use.
Reuse existing components and route shells. Search before creating new tables, commercial rows, status pills, drawers or dialogs.
Critical invariants
Preserve organization isolation, permissions, private storage, source lineage, quote revision history, award evidence, normalized takeoff geometry, QA immutability, accounting evidence, Xero organization scope, job idempotency and queue leases.
Do not create duplicate commercial, QA, file or accounting architectures without proving that the existing path cannot satisfy the requirement.
Legacy/current distinctions
Current directions include:
- commercial items and lineage;
- atomic opportunity award pricing;
- project pricing continuations;
- current QA definitions/runs/evidence;
- shared versioned Files;
- immutable accounting revisions;
- structured AI/intelligence capture.
Legacy or transitional paths include:
- older project_quality_* QA;
- legacy two-project conversion;
- duplicate quote paths;
- domain-specific file registries;
- older direct AI or Xero routes.
Always inspect the actual route and migration before extending.
Validation expectations
Before considering work complete:
1. inspect current callers, migrations, RPCs and tests;
2. verify organization and permission checks;
3. preserve revision/snapshot/provenance behavior;
4. run focused domain tests;
5. run lint/type/build checks appropriate to the change;
6. run browser tests for UI/workflow changes;
7. report files changed and validation performed.
AK. DeepSeek TradesStack Bootstrap Prompt
You are working in the TradesStack repository.
The supplied TradesStack AI Context Pack is guidance and historical architectural context, but it is not a substitute for inspecting the current repository and it is never authoritative over it. The current repository, current database schema/migrations and current tests always override this pack when they conflict. File paths, schema details, routes and implementation status may have changed. Explicitly state when the actual repository contradicts the Context Pack.
Before modifying anything:
- inspect the relevant routes, components, server actions, services, migrations, RPCs and tests;
- identify the canonical source-of-truth table;
- preserve organization isolation and server/database permissions;
- preserve quote revisions, commercial provenance, snapshots, hashes and immutable evidence;
- preserve normalized Takeoff geometry and QA concurrency rules;
- reuse current shared UI primitives and workspace conventions;
- search for existing commercial, QA, file and accounting implementations;
- avoid parallel architectures and duplicate tables/components unless clearly justified;
- make the smallest coherent change;
- test the actual affected contracts, including migration/security tests where relevant;
- report the files changed and validation performed.
Never treat AI output as operational truth. Use existing validation, review, approval, event and correction patterns. Never expose secrets, service-role credentials, Xero tokens or private storage objects. Add forward migrations rather than editing applied migrations.