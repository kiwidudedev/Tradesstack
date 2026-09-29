# Tradesstack Security Acceptance — Phase 0E

Date: 2026-09-26 (Pacific/Auckland)

# A. PASS 0E VERDICT

**PASS 0E COMPLETE WITH LOW-RISK HARDENING ITEMS.** A real privileged worker-boundary defect was found, fixed narrowly, and regression-tested. Representative Auth, tenancy, RLS, RPC, Storage, internal-claim, cron, worker, secret, bootstrap, and integration boundaries are accepted.

# B. PRODUCT PRESERVATION

Product functionality and Phase 0D evidence were preserved. No RLS, tenancy, permission, Storage, or trusted-claim weakening was used.

# C. SOURCE STATE

Branch `main`; HEAD `361bf3f094a8abbb58d20606413686cebc242e66`. The worktree was already dirty before Phase 0E. Pre-existing changes include Phase 0D contact, application, migration, fixture, and documentation work.

# D. OPERATING RULE COMPLIANCE

Independent surfaces continued after the worker finding. The defect was reproduced, traced, fixed, negatively/positively tested, and followed by database, Storage, Auth, cron, secrets, Edge-source, and build checks.

# E. DISPOSABLE SAFETY

Disposable project `tradesstack-0e-security-20260926` used ports 64421/64422/64423. The correct disposable-target guard returned `DISPOSABLE TARGET VERIFIED`; the disposable stack was stopped with `supabase stop --no-backup`. Protected local remained on 54321/54322/54323.

# F. PROTECTED SYSTEM IMPACT

Hosted/production Supabase and customer integrations were not touched. Active local was only inspected for read-only posture counts and remained running. No destructive Git command was used.

# G. SECURITY FIXTURE

Disposable Org A and Org B were created with owner users and separate synthetic Client/Project resources. Org A owner: `phase0e-owner-a@example.test`; Org B owner: `phase0e-owner-b@example.test`. Resources used known UUIDs for controlled IDOR, RLS, RPC, and Storage tests. A Worker/restricted-role path remained covered by prior Phase 0D evidence and source/regression tests.

# H. AUTHENTICATION

Auth JWT validation, issuer/audience/signature handling, session-backed route guards, and Supabase Auth user resolution passed representative tests. Invalid, unsigned, and incorrectly signed JWTs were rejected.

# I. UNAUTHENTICATED ROUTES

Unauthenticated `/app/dashboard` and `/app/projects` redirected to `/login`. Protected PDF and internal diagnostics APIs returned `401`. Xero connect redirected to sign-in. No sensitive payload was returned.

# J. API ROUTE CLASSIFICATION

| Class | Representative result |
|---|---|
| Public by design | Marketing/contact/registration surfaces remain public |
| Authenticated | Protected document, claim, project, AI, and integration APIs reject unauthenticated callers |
| Internal | Internal diagnostics/worker surfaces require admin or worker authority |
| Cron | `CRON_SECRET`/Xero cron secret required; wrong/missing secret denied |
| Webhook/provider callback | Xero callback binds current session and durable OAuth state |
| Service-only | Service-role work is server/worker/Edge-bound; not exposed to browser clients |

# K. SERVER ACTION AUTHORITY

Sensitive server actions establish current user, current organization, permission, and resource ownership before elevated reads/writes. Representative accounting, supplier invoice, retention, organization settings, QA, and commercial actions were source-audited and existing tests passed.

# L. RPC AUTHORITY

Representative direct RPCs enforce authentication, organization membership, permission, project/resource scope, and RLS/constraint boundaries. Cross-org schedule creation returned `schedule_not_found`; cross-org settings update returned `Not authorized for this organization`.

# M. ORGANIZATION MEMBERSHIP

Changing a supplied organization ID did not forge authority. Org B could not read or update Org A resources. Signup creates a new organization unless a valid explicit invite token is present; email matching alone cannot join an existing organization.

# N. IDOR MATRIX

| Resource | Org B against Org A known ID | Result |
|---|---|---|
| Client | Read/update | Denied / zero rows |
| Project | Read/update | Denied / zero rows |
| Quote, PO, variation, invoice, claim | Existing Phase 0D representative proof | Denied |
| Retention schedule | Cross-org create/read | Denied / not found |
| QA, task, issue, material, file | Existing Phase 0D representative proof | Denied |

# O. CRM / CLIENT SECURITY

Org A owner read was allowed; Org B known Client A read returned zero rows; Org B update was denied by RLS. Client organization scope is enforced in schema and policies.

# P. OPPORTUNITY SECURITY

Opportunity creation/linkage and cross-organization ownership are guarded by membership and organization-scoped policies/RPCs. Existing opportunity server and lifecycle tests passed.

# Q. PRE-AWARD WORKSPACE SECURITY

Workspace access is resolved through organization/project lineage and permission checks. Known cross-org workspace IDs do not grant access.

# R. PROJECT SECURITY

Org A owner read Project A succeeded; Org B read returned zero rows; Org B update returned zero rows. Direct organization/project mismatch is constrained by RLS and composite ownership checks.

# S. QUOTE SECURITY

Quote read/edit/status and accepted-quote lineage use organization/project authority. Cross-org access remains denied by prior acceptance and source/RPC checks.

# T. PURCHASE ORDER SECURITY

PO reads, edits, supplier relationships, statuses, lines, attachments, and document boundaries are organization/project scoped. Cross-org direct access remains denied.

# U. VARIATION SECURITY

Variation read/write/status and attachment paths are organization/project scoped. Cross-org access remains denied.

# V. SUPPLIER SECURITY

Organization suppliers and supplier products are scoped through organization ownership and permission checks. Shared/reference behavior is not used to grant cross-org transactional access.

# W. SUPPLIER INVOICE SECURITY

Invoice, matching, accounting state, document, and Storage access require the owning organization and appropriate permission. Existing invoice service/API tests passed.

# X. CLAIM SECURITY

Claim reads, writes, status transitions, and invoice-document routes require authenticated tenant/resource authority. Known cross-org claim access remains denied.

# Y. RETENTION SECURITY

Ordinary owner without the internal Phase 4 claim was denied. Cross-org owner was denied with `schedule_not_found`. Valid internal caller succeeded only after all ordinary membership/permission/tenant checks passed.

# Z. RETENTION INTERNAL CLAIM

`retention_phase4_internal=true` is read from a signed JWT claim. A valid local synthetic signing key succeeded; wrong-signature and unsigned tokens returned JWT 401 errors. User metadata was editable by the ordinary user but did not produce the trusted claim and retention remained denied. The claim is not minted by browser JSON, user metadata, or client headers.

# AA. OTHER PRIVILEGED CLAIMS

| Claim family | Purpose | Source/validation | Result |
|---|---|---|---|
| `retention_phase3_internal` | Phase 3 gated operation | Signed JWT/app-metadata gate | Source and migration tests pass |
| `retention_phase4_internal` | Schedule/release Phase 4 | Signed JWT gate | Forgery denied; valid internal test passed |
| `retention_phase5/6/8/9/10_internal` | Later phased operations | Signed JWT/service-role gates | Migration tests and source audit pass |
| `app.retention_phase*_internal_write` | Transaction-local DB write fence | `set_config` only inside trusted functions | Not client supplied |

# AB. APP_METADATA / USER_METADATA

Authorization-sensitive gates use signed claims and server/database checks. Ordinary `user_metadata` mutation did not alter `retention_phase4_internal` authority. No user-editable metadata was accepted as an authorization substitute.

# AC. ROLE / PERMISSION SECURITY

The tested authority chain is user → organization membership → role → permission → member override → `has_org_permission`. Owner access passed; cross-org and lower-role denials remain accepted. Sensitive administration requires the documented permission catalog.

# AD. RLS INVENTORY

Disposable database posture: 276 public tables, 274 with RLS enabled, 253 forced RLS, and 450 public policies. The two intentionally non-RLS public tables are request rate/concurrency limiter tables. All high-risk tenant tables inspected had RLS/forced RLS as expected. Storage objects are separately policy-controlled.

# AE. DIRECT TABLE SECURITY

Anonymous direct project read returned zero rows. Org B direct reads of Org A project/client returned zero rows; direct update returned zero rows. Direct organization settings RPC injection was rejected.

# AF. SECURITY DEFINER FUNCTIONS

612 public `SECURITY DEFINER` routines were inventoried on disposable replay. **0** lacked an explicit `search_path`. High-risk functions use `public`/`pg_catalog` search paths and were spot-checked for actor, membership, permission, and tenant derivation.

# AG. RPC EXECUTE GRANTS

Privileged RPCs are generally authenticated-only or service-role-only as appropriate. Retention schedule RPCs are not executable by `anon`; ordinary authenticated callers still require the internal claim and normal permissions. Functions with broad authenticated grants perform their own auth/tenant checks.

# AH. SERVICE ROLE INVENTORY

Service-role usage is concentrated in server actions, server libraries, workers, Xero/accounting services, document/QA services, and Edge Functions. Browser components do not import the admin client. Each reviewed user-facing elevated path establishes current user/organization/permission before querying with service role.

# AI. SERVICE ROLE CONTAINMENT

The takeoff worker was the exception found: its route accepted any authenticated browser user before the fix. It now requires `TAKEOFF_RENDER_WORKER_TOKEN` exclusively. Regression proves missing/wrong token returns 401 and valid token alone processes the worker boundary.

# AJ. STORAGE BUCKET SECURITY

| Bucket | Public | Authority |
|---|---:|---|
| `organization-logos` | Yes | Path-scoped member read; privileged scoped writes |
| `organization-documents` | No | Document workspace/upload authorization |
| `project-drawing-sets` | No | Project membership and drawing ownership |
| `project-qa-evidence` / `project-quality-photos` | No | QA/project ownership |
| `task-attachments` / `project-variation-attachments` | No | Task/project/variation ownership |
| `supplier-invoice-documents` / `retention-claim-documents` | No | Invoice/retention authorization |
| `material-library-imports` | No | Materials import authorization |

Disposable inventory found 10 buckets and 27 Storage object policies: 7 SELECT, 8 INSERT, 5 UPDATE, and 7 DELETE policies.

# AK. STORAGE PATH MANIPULATION

Org B upload into Org A’s organization-logo path was denied with Storage RLS 403. Org B delete of Org A’s known object was denied. Path changes cannot substitute for membership.

# AL. FILE STORAGE SECURITY

Private document/files workflows use workspace/node authorization before upload/download and private Storage policies. Phase 0D cross-org file/version evidence remains accepted; source and migration hardening checks passed.

# AM. QA STORAGE SECURITY

QA evidence and photo paths are project/organization scoped. Existing QA Storage denial evidence and source policy checks passed; no cross-org photo read or write was accepted.

# AN. TASK / ISSUE STORAGE SECURITY

Task attachment and issue/QA-photo paths are tenant/project scoped. Existing Phase 0D direct upload/read/denial evidence remains accepted; Storage policies require the corresponding access helper.

# AO. DRAWING STORAGE SECURITY

Drawing sets and previews use private project-scoped buckets and signed URLs generated only after project/workspace access. Cross-org direct path access is denied by policy/helper checks.

# AP. SUPPLIER INVOICE STORAGE SECURITY

Supplier invoice documents use private Storage and server-side invoice ownership checks before signed URL generation. Cross-org invoice/document access remains denied.

# AQ. ORGANIZATION LOGO SECURITY

Org A owner upload succeeded for its own path. Org B upload and delete against Org A’s path both returned Storage 403. The current scoped logo policy fix remains effective.

# AR. SIGNED URL SECURITY

Signed URL generation is inventory-limited to drawing, preview, QA, document, invoice, and related server paths. Authorization is performed before signing; expiry is bounded (commonly 60 minutes, or the configured document lifetime). No arbitrary unauthenticated signed URL endpoint was found.

# AS. UPLOAD RESERVATION SECURITY

Document upload initiate/complete/abandon flows use authenticated workspace authorization, reserved metadata, bounded upload state, and server-side ownership checks. Existing upload lifecycle tests passed.

# AT. FILE VERSION SECURITY

Version creation and completion require the owning document workspace/node. Cross-tenant version creation is denied by the RPC and RLS contract.

# AU. QA IMMUTABILITY

Completed/signed QA lifecycle records use database lifecycle guards, append-only evidence/activity patterns, and restricted post-completion mutation. Existing QA immutability/concurrency tests passed.

# AV. SIGNATURE SECURITY

Signature artifacts validate PNG metadata/content and recorded signer identity. Post-signoff mutation is guarded by QA lifecycle rules; no alternate client-only signature authority was found.

# AW. COMMERCIAL STATUS SECURITY

PO, variation, quote, claim, and invoice status transitions are RPC/database controlled. Representative invalid or cross-tenant transitions remain rejected by existing contracts and migrations.

# AX. ACCOUNTING SECURITY

Accounting configuration, mappings, sync jobs, claim accounting state, and Xero-linked records are organization-scoped and permission-gated. Cross-org configuration mutation was denied; accounting worker paths are service/internal controlled.

# AY. XERO TOKEN SECURITY

Xero tokens are stored in organization-owned encrypted secret rows and accessed server-side. Access/refresh tokens were not printed or returned to browser payloads. Live provider execution remains human-input dependent and was not attempted.

# AZ. XERO CALLBACK SECURITY

OAuth state is durable, hashed, time-limited, single-use, user-bound, organization-bound, and checked before completion. Callback errors fail safely. No real provider callback mutation was performed.

# BA. OPENAI / AI SECURITY

AI routes establish authenticated user and organization/project context before provider calls. API keys remain server-only. Provider execution was not performed without a restricted development key.

# BB. AI FILE AUTHORITY

AI file/project workflows use server-side document/project context and tenant-scoped reads. No client-bundle service role or arbitrary cross-org file authority was found.

# BC. EMAIL SECURITY

Contact/early-access surfaces are intentionally public; internal invite email requires an authenticated owner of the supplied organization and invite. Resend is not invoked without configured human-provided credentials.

# BD. INVITE SECURITY

Signup cannot select an existing organization or role without a valid explicit invite token. Invite email delivery checks owner membership, organization binding, pending status, and invite ID. Invite reuse/alteration is rejected by the database workflow.

# BE. EDGE FUNCTION AUTHORITY

Edge source audit covered mobile bootstrap, clock-in/out, time-sheet rules, and invite email. Functions validate bearer tokens, derive identity through Auth, scope organization/project membership, and use service role only after authorization. Local Edge runtime execution was not required for this source-proven boundary.

# BF. MOBILE FUNCTION SECURITY

Mobile bootstrap rejects arbitrary organization selection. Clock-in requires active project membership and validates project/PO scope. Clock-out resolves the existing user-owned/member-scoped entry rather than trusting a supplied organization.

# BG. CRON SECURITY

All representative cron routes require `CRON_SECRET` or the Xero cron secret. A 13-file cron/worker test run passed **44 tests** with missing/wrong/valid secret cases and disabled-job behavior.

# BH. WORKER SECURITY

The takeoff render worker boundary was hardened to require its dedicated token. Other worker/queue paths use cron secret, platform-admin, service-role, or internal worker controls. Invalid takeoff token no longer falls through to browser Auth.

# BI. WEBHOOK SECURITY

Current callback/webhook-like boundaries use Xero OAuth state/signature/provider contracts and server-only secrets. No uncontrolled external webhook was invoked.

# BJ. SECRET EXPOSURE

No `NEXT_PUBLIC_*` secret/key/token/password variable was found. Service role, OpenAI, Resend, Xero, and worker secrets are server/Edge environment variables. Token values were not printed during testing.

# BK. CLIENT BUNDLE SECRET SCAN

Production build passed. Source scan found no service-role, Xero secret, OpenAI key, Resend key, or worker token in client components or `NEXT_PUBLIC_*` variables. Only the public Supabase URL/anon key contract is client-visible.

# BL. LOGGING SECURITY

Reviewed logs emit IDs, status, counts, and correlation codes rather than access/refresh tokens, service-role keys, API keys, or signed URL contents. Xero error handling uses safe codes/messages.

# BM. ERROR RESPONSE SECURITY

Unauthenticated routes returned controlled 401/redirect responses. Cross-org RPCs returned authorization/not-found outcomes. Invalid JWTs returned generic PostgREST 401 errors without secret material. The known Next test mismatch is environmental, not a production error leak.

# BN. SIGNUP / BOOTSTRAP SECURITY

Synthetic signup created only the caller’s own organization. User-supplied `organization_name` is naming data, not an authority selector. Existing organization IDs, roles, and privileged metadata cannot be injected through ordinary signup.

# BO. INVITE BOOTSTRAP SECURITY

Explicit invite token, invited email, pending status, and expiry are required. The invite is accepted into its stored organization/role; caller-supplied organization identity cannot redirect it.

# BP. MEMBERSHIP / ROLE ADMIN SECURITY

Membership and role administration are owner/admin permission-gated. Ordinary users cannot edit their own permission overrides or assign themselves a higher role. Cross-org member IDs do not confer authority.

# BQ. ORGANIZATION SETTINGS SECURITY

Organization settings RPC and Storage updates require the organization permission and path scope. Org B’s attempted Org A settings update returned `Not authorized for this organization`.

# BR. INTEGRATION SETTINGS SECURITY

Xero connection, tenant selection, mappings, and sync controls require organization settings permission and tenant identity checks. AI/email integration keys remain server-only.

# BS. INDIRECT / CHILD TENANCY

Child resources use organization/project composite foreign keys, RLS parent access, and server/RPC checks. Prior Phase 0D tests covered PO lines, variation lines, QA evidence, task attachments, claim/retention paths, and file versions.

# BT. CROSS-TENANT LINK INJECTION

Direct Org B attempts to use Org A project/client IDs were rejected or returned zero rows. Composite scope constraints and validation triggers prevent mismatched parent/child ownership.

# BU. PRIVILEGE ESCALATION MATRIX

| Actor | Attempt | Expected | Actual | Result |
|---|---|---|---|---|
| Anonymous | Dashboard/API access | Redirect/401 | Redirect/401 | PASS |
| Org A owner | Own client/project | Allow | Allow | PASS |
| Org B owner | Org A client/project | Deny | Zero rows | PASS |
| Org B owner | Org A settings/RPC | Deny | 400 authorization error | PASS |
| Ordinary owner | Phase 4 retention without claim | Deny | Gate denial | PASS |
| Forged JWT | Phase 4 retention | Deny | 401 | PASS |
| Browser-authenticated user | Takeoff worker | Deny | 401 after fix | PASS |
| Worker token | Takeoff worker | Allow | Idle/processed response | PASS |
| Valid internal claim | Phase 4 retention | Allow with permissions | Allowed | PASS |
| Service role | Internal server work | Allow only server boundary | Source-contained | PASS |

# BV. SECURITY FINDINGS

| ID | Finding | Severity | Affected Boundary | Fixed? | Regression |
|---|---|---|---|---|---|
| SEC-0E-001 | Takeoff render route fell back from invalid worker token to any authenticated browser user while processing service-role-backed pending jobs | High | Worker/service-role boundary | Yes | `app/api/takeoff/render-jobs/run/route.test.ts` |

# BW. CRITICAL FINDINGS

**NONE.**

# BX. HIGH FINDINGS

**NONE REMAINING.** SEC-0E-001 was fixed and verified.

# BY. MEDIUM FINDINGS

**NONE.**

# BZ. LOW / INFORMATIONAL FINDINGS

The installed `node_modules` contains Next `16.1.6` while `package.json` requests `16.3.3`. Two environment-sensitive security compatibility assertions fail under that mismatch: the framework test’s synthetic Server Action error expectation and the image optimizer AVIF passthrough expectation. They do not indicate an application Auth/RLS defect; dependency reconciliation should be done in ordinary toolchain maintenance.

# CA. APPLICATION FILES CHANGED

- `app/api/takeoff/render-jobs/run/route.ts` — require dedicated worker token; remove browser-session fallback.

# CB. SECURITY MIGRATIONS

**NONE.** No database migration was required.

# CC. TEST FILES CHANGED

- `app/api/takeoff/render-jobs/run/route.test.ts` — missing/wrong/valid worker-token regression.

# CD. DOCUMENTATION CHANGES

- This report updated from Phase 0D acceptance to the Phase 0E security record.

# CE. TEST RESULTS

Focused security/route run: **14 files passed, 68 tests passed, 5 skipped, 1 known environment-sensitive test failed** (Next version mismatch). Cron/worker run: **13 files passed, 44 tests passed**. New worker regression: **1 file passed, 2 tests passed**. Phase 0D retention/contact regression remains **8 files passed, 40 tests passed**.

# CF. FINAL BUILD

**PASS.** `npm run build` completed production compilation, TypeScript, static generation, and route collection successfully.

# CG. FINAL FRESH REPLAY

Fresh disposable security replay completed with synthetic Org A/Org B users/resources, Auth tokens, RLS/IDOR/RPC/Storage/retention tests, posture RPC checks, and worker-claim tests. No security migration changed the schema, so a second post-fix migration replay was not required; the application route regression was run directly.

# CH. CLEAN DATA

Only disposable synthetic users, organizations, clients, projects, one logo object, and test retention schedules were created. The disposable stack was stopped. No protected data was used.

# CI. PRODUCTION IMPACT

**NONE.**

# CJ. HOSTED SUPABASE IMPACT

**NONE.**

# CK. ACTIVE LOCAL IMPACT

**NONE.** Active local Supabase remains running on 54321/54322/54323.

# CL. HUMAN APPROVAL REQUIRED

None for the resolved worker fix. Xero/OpenAI/Resend live testing still requires the previously documented human credentials and safe test systems; no provider action was taken.

# CM. REMAINING SECURITY GAPS

No material internal Auth, tenancy, RLS, Storage, RPC, worker, cron, trusted-claim, or secret-exposure gap remains from this representative pass. Remaining items are dependency/toolchain alignment and live external-provider validation, not proven application security defects.

# CN. PHASE 0E STATUS

**PHASE 0E COMPLETE.**

# CO. MASTER SECURITY READINESS

TradesStack Master is suitable to continue toward dedicated client extraction from an internal security-boundary perspective: application, database, Auth, Storage, worker, and integration authority is tenant/permission constrained at representative depth. This is not an external penetration-test certification.

# CP. NEXT RECOMMENDED PASS

Proceed to the next evidence-driven Master-platform phase for dedicated-client extraction/readiness planning. Do not begin it automatically in this pass.

# CQ. FINAL GIT SAFETY

Final HEAD remains `361bf3f094a8abbb58d20606413686cebc242e66`.

**PRE-EXISTING CHANGES:** all previously dirty application, test, migration, artifact, script, generated-type, and documentation files listed by `git status --short` before Phase 0E.

**PHASE 0E CHANGES:** `app/api/takeoff/render-jobs/run/route.ts`, new `app/api/takeoff/render-jobs/run/route.test.ts`, and this report. Nothing was discarded, reset, cleaned, or checked out.
