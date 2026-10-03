import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(
  new URL("../app/api/mobile/project-variations/attachments/download/route.ts", import.meta.url),
  "utf8",
);

describe("mobile Variation attachment download boundary", () => {
  it("authenticates and derives membership context before reading the attachment", () => {
    expect(routeSource).toContain("supabase.auth.getUser()");
    expect(routeSource).toContain('"resolve_mobile_project_member_context_v2"');
    expect(routeSource).toContain('"organization_id", context.organization_id');
    expect(routeSource).toContain('.eq("project_id", projectId)');
    expect(routeSource).toContain('.eq("variation_id", variationId)');
  });

  it("returns a short-lived signed URL and never exposes storage_path", () => {
    expect(routeSource).toContain("createSignedUrl(storagePath, SIGNED_URL_SECONDS)");
    expect(routeSource).toContain("expires_in: SIGNED_URL_SECONDS");
    expect(routeSource).not.toContain("storage_path: attachment.storage_path");
    expect(routeSource).not.toContain("storage_path,\n");
  });

  it("supports bearer-authenticated WorkApp requests and keeps private responses uncached", () => {
    expect(routeSource).toContain('request.headers.get("authorization")');
    expect(routeSource).toContain('"Cache-Control": "no-store"');
    expect(routeSource).toContain("const expectedPrefix =");
  });
});
