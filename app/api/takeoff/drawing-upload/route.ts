import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredR2StorageProvider } from "@/lib/storage/provider";
import { MAX_DRAWING_SET_UPLOAD_SIZE_BYTES, toDefaultDrawingSetDisplayName, toDrawingSetStoragePath } from "@/lib/drawing-sets";
import type { Database } from "@/lib/supabase/types";

const SELECT = "id, organization_id, project_id, uploaded_by, file_name, display_name, sort_order, archived_at, archived_by, source_type, source_revision, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const fileName = url.searchParams.get("fileName")?.trim() ?? "";
  const size = Number(url.searchParams.get("size") ?? "0");
  if (!organizationId || !projectId || !fileName || !Number.isSafeInteger(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid drawing upload reservation." }, { status: 400 });
  }
  if (size > MAX_DRAWING_SET_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "Drawing exceeds the 5 GB upload limit." }, { status: 413 });
  }
  if (!request.body || request.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "application/pdf") {
    return NextResponse.json({ error: "A PDF request body is required." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: project } = await supabase
    .from("organization_projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project access denied." }, { status: 403 });

  const legacyShape = toDrawingSetStoragePath({ organizationId, projectId, fileName }).split("/");
  const storagePath = [...legacyShape.slice(0, 2), "r2", ...legacyShape.slice(2)].join("/");
  const fixedLengthStream = (globalThis as typeof globalThis & { FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array> }).FixedLengthStream;
  if (!fixedLengthStream) return NextResponse.json({ error: "Streaming upload support is unavailable." }, { status: 503 });

  try {
    const storage = await getConfiguredR2StorageProvider();
    const stored = await storage.put({
      key: storagePath,
      body: request.body.pipeThrough(new fixedLengthStream(size)),
      contentType: "application/pdf",
      contentLength: size,
    });
    const payload: Database["public"]["Tables"]["project_drawing_sets"]["Insert"] = {
      organization_id: organizationId,
      project_id: projectId,
      uploaded_by: user.id,
      file_name: fileName,
      display_name: toDefaultDrawingSetDisplayName(fileName),
      source_type: "source",
      source_revision: crypto.randomUUID(),
      sort_order: -1,
      storage_path: storagePath,
      file_size_bytes: stored.size,
      mime_type: "application/pdf",
    };
    const { data: drawingSet, error } = await supabase.from("project_drawing_sets").insert(payload).select(SELECT).single();
    if (error || !drawingSet) {
      await storage.delete(storagePath);
      return NextResponse.json({ error: "Drawing uploaded, but metadata could not be saved." }, { status: 409 });
    }
    return NextResponse.json({ drawingSet }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[takeoff-upload:r2] failed", { organizationId, projectId, fileName, size, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Unable to store the drawing. Please retry." }, { status: 502 });
  }
}
