import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260829130000_fix_project_qa_lock_version_ambiguity.sql", "utf8");

describe("Project QA lock-version ambiguity fix", () => {
  it("qualifies response and run lock versions in save and completion RPCs", () => {
    expect(migration).toContain("lock_version=response.lock_version+1");
    expect(migration).toContain("returning response.lock_version,response.updated_at");
    expect(migration).toContain("lock_version=run.lock_version+1");
    expect(migration).toContain("returning run.completed_at,run.lock_version");
    expect(migration).not.toMatch(/lock_version=lock_version\+1/);
  });

  it("retains narrow authenticated command grants", () => {
    expect(migration).toContain("revoke all on function public.save_project_qa_response_v1");
    expect(migration).toContain("grant execute on function public.save_project_qa_response_v1");
  });
});
