import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DynamicRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";
  if (!UUID_PATTERN.test(workspaceId)) {
    return NextResponse.json(
      { error: "A valid workspace identifier is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await (supabase.rpc as unknown as DynamicRpc)(
    "get_document_storage_diagnostics",
    { p_workspace_id: workspaceId },
  );
  if (result.error) {
    return NextResponse.json(
      { error: "Document diagnostics are unavailable or access was denied." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
