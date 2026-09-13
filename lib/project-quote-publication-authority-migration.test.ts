import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260819140000_align_quote_publication_and_pdf_authority.sql",
  "utf8",
);
const reconciliationFixMigration = readFileSync(
  "supabase/migrations/20260819200000_fix_atomic_worksheet_quote_publication.sql",
  "utf8",
);
const sourceTotalAuthorityMigration = readFileSync(
  "supabase/migrations/20260823160000_fix_quote_publication_source_total_authority.sql",
  "utf8",
);
const quotePage = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
  "utf8",
);

describe("Project Quote publication authority", () => {
  it("validates stored lines, subtotal, GST, and total with quote rounding", () => {
    expect(migration).toContain("line.total <> round(line.quantity * line.rate, 2)");
    expect(migration).toContain("quote_row.subtotal <> round(computed_subtotal, 2)");
    expect(migration).toContain("quote_row.gst_amount <> round(computed_gst, 2)");
    expect(migration).toContain("quote_row.total_quote_price <> round(computed_total, 2)");
    expect(migration).toContain("coalesce(item.total");
    expect(migration).toContain("duplicate_source_link_count");
  });

  it("validates sparse total-only sources through the Quote effective-value contract", () => {
    expect(reconciliationFixMigration).toContain("coalesce(item.quantity, 1::numeric) as quantity");
    expect(reconciliationFixMigration).toContain("coalesce(item.unit, 'Item') as unit");
    expect(reconciliationFixMigration).toContain("then item.total / coalesce(item.quantity, 1::numeric)");
    expect(reconciliationFixMigration).toContain("round(effective_source.rate, 2) <> round(line.rate, 2)");
    expect(reconciliationFixMigration).toContain("line.total <> round(line.quantity * line.rate, 2)");
  });

  it("reconciles source totals through effective Quote quantity and rate", () => {
    expect(sourceTotalAuthorityMigration).toContain(
      "round(effective_source.quantity * effective_source.rate, 2) <> line.total",
    );
    expect(sourceTotalAuthorityMigration).not.toContain(
      "coalesce(item.total, effective_source.quantity * effective_source.rate)",
    );
    expect(sourceTotalAuthorityMigration).toContain("when item.rate is not null then item.rate");
    expect(sourceTotalAuthorityMigration).toContain(
      "then item.total / coalesce(item.quantity, 1::numeric)",
    );
  });

  it("keeps every non-total Quote publication reconciliation guard", () => {
    for (const guard of [
      "line.pricing_source_kind <> 'worksheet'",
      "round(effective_source.quantity, 3) <> round(line.quantity, 3)",
      "effective_source.unit <> line.unit",
      "round(effective_source.rate, 2) <> round(line.rate, 2)",
      "line.total <> round(line.quantity * line.rate, 2)",
      "duplicate_source_link_count",
      "quote_row.subtotal <> round(computed_subtotal, 2)",
      "quote_row.optional_subtotal <> round(computed_optional_subtotal, 2)",
      "quote_row.margin_amount <> round(computed_margin, 2)",
      "quote_row.gst_amount <> round(computed_gst, 2)",
      "quote_row.total_quote_price <> round(computed_total, 2)",
      "Award-locked quote revisions cannot be republished",
    ]) {
      expect(sourceTotalAuthorityMigration).toContain(guard);
    }
  });

  it("saves, links, validates, and records an idempotency key in one transaction", () => {
    expect(reconciliationFixMigration).toContain("create or replace function public.publish_worksheet_commercial_quote_v1");
    expect(reconciliationFixMigration).toContain("from public.save_commercial_quote_draft(");
    expect(reconciliationFixMigration).toContain("perform public.link_commercial_item_to_quote_line");
    expect(reconciliationFixMigration).toContain("perform public.validate_and_record_quote_publication_v1");
    expect(reconciliationFixMigration).toContain("primary key (organization_id, request_key)");
    expect(reconciliationFixMigration).toContain("if found then");
    expect(reconciliationFixMigration).toContain("existing_request.quote_id");
    expect(reconciliationFixMigration).toContain("insert into public.worksheet_quote_publication_requests");
  });

  it("records selected commercial sources while retaining manual lines", () => {
    expect(migration).toContain("'manualLineIds'");
    expect(migration).toContain("'commercialItems'");
    expect(migration).toContain("item.source_range");
    expect(migration).toContain("item.source_signature");
  });

  it("rejects publication to an award-locked revision", () => {
    expect(migration).toContain("Award-locked quote revisions cannot be republished");
  });

  it("marks unlocked published quotes stale after source workbook changes", () => {
    expect(migration).toContain("pricing_basis_status = 'stale'");
    expect(migration).toContain("quote.award_locked_at is null");
    expect(migration).toContain("mark_quote_basis_stale_from_sheet");
    expect(migration).toContain("mark_quote_basis_stale_from_line");
  });

  it("re-reads persisted issued revisions for PDF export", () => {
    expect(quotePage).toContain("requiresPersistedAuthority");
    expect(quotePage).toContain("buildPersistedProjectQuotePdfSnapshot");
  });
});
