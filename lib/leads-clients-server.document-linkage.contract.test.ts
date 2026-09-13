import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const conversionSource = fs.readFileSync(
  path.join(process.cwd(), "lib/leads-clients-server.ts"),
  "utf8",
);
const documentServiceSource = fs.readFileSync(
  path.join(process.cwd(), "lib/documents/workspace-server.ts"),
  "utf8",
);
const atomicConversionSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730120000_add_atomic_opportunity_conversion.sql",
  ),
  "utf8",
);

describe("Opportunity conversion document linkage contract", () => {
  it("preserves existing drawing-copy behavior and keeps document linkage metadata-only", () => {
    expect(conversionSource).toContain(
      ".copy(row.storage_path, targetStoragePath)",
    );
    const linkFunction = documentServiceSource.slice(
      documentServiceSource.indexOf(
        "export async function ensureOpportunityProjectDocumentWorkspace",
      ),
      documentServiceSource.indexOf(
        "export async function listDocumentWorkspace",
      ),
    );
    expect(linkFunction).toContain(
      '"ensure_opportunity_project_document_workspace"',
    );
    expect(linkFunction).not.toContain(".storage");
    expect(linkFunction).not.toMatch(/\.(copy|move|remove)\(/);
  });

  it("designates the final Project before linking and marks Won only after linkage", () => {
    const atomicConversion = atomicConversionSql.slice(
      atomicConversionSql.indexOf(
        "create or replace function public.convert_accepted_opportunity_to_project",
      ),
    );
    const finalProjectIdentity = atomicConversion.indexOf(
      "insert into public.opportunity_final_projects",
    );
    const documentLink = atomicConversion.indexOf(
      "ensure_opportunity_project_document_workspace",
    );
    const finalWon = atomicConversion.indexOf("stage = 'Won'", documentLink);

    expect(finalProjectIdentity).toBeGreaterThan(-1);
    expect(documentLink).toBeGreaterThan(finalProjectIdentity);
    expect(finalWon).toBeGreaterThan(documentLink);
  });
});
