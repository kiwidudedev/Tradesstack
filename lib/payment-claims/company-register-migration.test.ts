import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260729120000_add_company_payment_claims_register.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();
const claimDateMonthMigration = readFileSync(
  "supabase/migrations/20260729130000_use_claim_date_for_company_payment_claims_month.sql",
  "utf8",
).replace(/\s+/g, " ").toLowerCase();
const excludeDraftMigration = readFileSync(
  "supabase/migrations/20260729140000_exclude_draft_company_payment_claims.sql",
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("company Payment Claims register migration", () => {
  it("independently enforces authentication, membership, and the approved permission", () => {
    expect(normalized).toContain("if auth.uid() is null");
    expect(normalized).toContain("from public.organization_members member");
    expect(normalized).toContain("member.user_id = auth.uid()");
    expect(normalized).toContain(
      "public.has_org_permission( p_organization_id, 'accounting.sales_invoices.view' )",
    );
    expect(normalized).toContain("security definer");
    expect(normalized).toContain("revoke all on function");
    expect(normalized).toContain("from public, anon");
  });

  it("inherits the approved owner, admin, QS, project-manager and worker role decision", () => {
    const permissionMigration = readFileSync(
      "supabase/migrations/20260722103000_add_xero_sales_invoice_claim_identity_foundation.sql",
      "utf8",
    ).replace(/\s+/g, " ").toLowerCase();
    for (const role of ["owner", "admin", "qs", "project_manager"]) {
      expect(permissionMigration).toContain(
        `('${role}', 'accounting.sales_invoices.view', true)`,
      );
    }
    expect(permissionMigration).toContain(
      "('worker', 'accounting.sales_invoices.view', false)",
    );
  });

  it("scopes every claim to the requested organization without project membership", () => {
    expect(normalized).toContain("where claim.organization_id = p_organization_id");
    expect(normalized).not.toContain("join public.project_members");
    expect(normalized).not.toContain("from public.project_members");
  });

  it("starts from claims and deterministically selects one current-tenant document", () => {
    expect(normalized).toContain("from public.project_claims claim");
    expect(normalized).toContain("left join lateral");
    expect(normalized).toContain("candidate.accounting_connection_id = connection.id");
    expect(normalized).toContain("candidate.tenant_id = connection.tenant_id");
    expect(normalized).toContain("limit 1");
    expect(normalized).toContain("revision.id = document.active_accounting_revision_id");
    expect(normalized).toContain("projection.id = document.current_accounting_projection_id");
  });

  it("cannot multiply rows through revisions, observations, or jobs", () => {
    expect(normalized).not.toContain(
      "join public.organization_accounting_remote_observations",
    );
    expect(normalized).not.toContain(
      "join public.organization_accounting_sync_jobs",
    );
    expect(normalized).not.toContain(
      "join public.organization_accounting_revision_attempts",
    );
    expect(normalized).not.toContain("join public.organization_accounting_events");
  });

  it("uses claim-period month boundaries with the explicit legacy fallback", () => {
    expect(normalized).toContain(
      "coalesce(claim.period_end, claim.claim_date) as period_key",
    );
    expect(normalized).toContain("base.period_key >= v_month_start");
    expect(normalized).toContain("base.period_key < v_next_month_start");
    expect(normalized).toContain("now() at time zone v_timezone");
    expect(normalized).toContain(
      "(coalesce(period_end, claim_date)) desc",
    );
    expect(normalized).toContain("with base as not materialized");
  });

  it("moves the register month key to the submitted claim date", () => {
    expect(claimDateMonthMigration).toContain(
      "'coalesce(claim.period_end, claim.claim_date) as period_key'",
    );
    expect(claimDateMonthMigration).toContain(
      "'claim.claim_date as period_key'",
    );
    expect(claimDateMonthMigration).toContain(
      "project_claims_company_register_claim_date_idx",
    );
    expect(claimDateMonthMigration).not.toContain(
      "claim.period_end as period_key",
    );
  });

  it("defaults an omitted month to the organization-local current month", () => {
    expect(normalized).toContain("v_today := (now() at time zone v_timezone)::date");
    expect(normalized).toContain("else to_char(v_today, 'yyyy-mm')");
  });

  it("excludes Draft claims before filtering, metrics, options, and pagination", () => {
    expect(excludeDraftMigration).toContain(
      "'where claim.organization_id = p_organization_id'",
    );
    expect(excludeDraftMigration).toContain(
      "and claim.status <> ''draft''",
    );
    expect(excludeDraftMigration).toContain("execute v_updated_definition");
  });

  it("keeps claim, Xero, external invoice, and payment states separate", () => {
    expect(normalized).toContain("claim.status as claim_status");
    expect(normalized).toContain("end as xero_status");
    expect(normalized).toContain("as external_status");
    expect(normalized).toContain("end as payment_status");
  });

  it("does not trust divergent payment amounts and handles voided records explicitly", () => {
    expect(normalized).toContain(
      "when projection.divergent then null else projection.amount_paid_minor",
    );
    expect(normalized).toContain(
      "when projection.divergent then null else projection.amount_due_minor",
    );
    expect(normalized).toContain("not in ('voided', 'deleted')");
  });

  it("filters and paginates before returning rows while metrics use the same filtered CTE", () => {
    expect(normalized).toContain("filtered as materialized");
    expect(normalized).toContain("select filtered.* from filtered order by");
    expect(normalized).toContain("limit v_page_size");
    expect(normalized).toContain("offset (v_page - 1) * v_page_size");
    expect(normalized).toContain("from filtered )");
    expect(normalized).toContain("'totalrows', (select count(*) from filtered)");
  });

  it("characterizes the intentionally broader historical direct-table RLS", () => {
    const claimsMigration = readFileSync(
      "supabase/migrations/20260323212000_create_project_claims.sql",
      "utf8",
    ).replace(/\s+/g, " ").toLowerCase();
    expect(claimsMigration).toContain(
      "using (public.is_member_of_organization(project_claims.organization_id))",
    );
    expect(normalized).toContain("'accounting.sales_invoices.view'");
  });
});
