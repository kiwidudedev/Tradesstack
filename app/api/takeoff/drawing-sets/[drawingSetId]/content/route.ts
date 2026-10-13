import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredR2StorageProvider, isR2StorageKey } from "@/lib/storage/provider";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(request: Request, { params }: { params: Promise<{ drawingSetId: string }> }) {
  const { drawingSetId } = await params;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let supabase = await createServerSupabaseClient();
  let privileged = false;
  if (bearer) {
    try {
      const { env } = await getCloudflareContext({ async: true });
      const expected = (env as { TAKEOFF_CONTAINER_TOKEN?: string }).TAKEOFF_CONTAINER_TOKEN ?? "";
      privileged = Boolean(expected && bearer === expected);
    } catch {
      privileged = false;
    }
  }
  if (!privileged) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  } else {
    supabase = createAdminSupabaseClient();
  }
  const { data: drawingSet, error } = await supabase.from("project_drawing_sets").select("id,storage_path,file_name,mime_type,file_size_bytes").eq("id", drawingSetId).maybeSingle();
  if (error || !drawingSet) return NextResponse.json({ error: "Drawing not found." }, { status: 404 });

  if (!isR2StorageKey(drawingSet.storage_path)) {
    const signed = await supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).createSignedUrl(drawingSet.storage_path, 300);
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Drawing is unavailable." }, { status: 404 });
    return NextResponse.redirect(signed.data.signedUrl);
  }

  const object = await (await getConfiguredR2StorageProvider()).get(drawingSet.storage_path);
  if (!object) return NextResponse.json({ error: "Drawing is unavailable." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": drawingSet.mime_type || "application/pdf",
      "content-length": String(object.metadata.size),
      "content-disposition": `inline; filename="${drawingSet.file_name.replace(/[\"\r\n]/g, "_")}"`,
      "cache-control": "private, max-age=60",
    },
  });
}
