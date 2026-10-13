import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredR2StorageProvider } from "@/lib/storage/provider";
import { assertDocumentNodeId } from "@/lib/documents/validation";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ nodeId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const nodeId = assertDocumentNodeId((await context.params).nodeId);
  // Resolve through the user-bound client so the SECURITY DEFINER function
  // evaluates auth.uid() and the database remains the authorization source.
  const { data: resolved, error: resolveError } = await supabase.rpc("resolve_document_download", { p_node_id: nodeId });
  const row = Array.isArray(resolved) ? resolved[0] : resolved;
  if (resolveError || !row) return NextResponse.json({ error: "Document file not found or access denied." }, { status: 404 });
  const object = await (await getConfiguredR2StorageProvider()).get(row.storage_key);
  if (!object) return NextResponse.json({ error: "Document file not found." }, { status: 404 });
  return new NextResponse(object.body, { headers: { "content-type": row.verified_mime_type || "application/octet-stream", "content-disposition": `attachment; filename="${String(row.display_name).replaceAll('"', '')}"`, "cache-control": "private, no-store" } });
}
