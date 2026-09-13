import { NextResponse } from "next/server";
import { listDocumentFolders } from "@/lib/documents/workspace-server";
import { assertDocumentNodeId, toSafeDocumentError } from "@/lib/documents/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { workspaceId: rawWorkspaceId } = await context.params;
    const workspaceId = assertDocumentNodeId(rawWorkspaceId);
    const folders = await listDocumentFolders(supabase, workspaceId);
    return NextResponse.json({ folders }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const safe = toSafeDocumentError(error);
    return NextResponse.json(
      { error: safe.message, code: safe.code },
      { status: safe.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
