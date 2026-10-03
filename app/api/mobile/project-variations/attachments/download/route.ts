import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

const BUCKET = "project-variation-attachments";
const SIGNED_URL_SECONDS = 300;

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function getAuthenticatedClient(request: Request): Promise<SupabaseClient<Database>> {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return createServerSupabaseClient();
  }

  const { url, anonKey } = getSupabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const projectId = searchParams.get("project_id");
  const variationId = searchParams.get("variation_id");
  const attachmentId = searchParams.get("attachment_id");

  if (!isUuid(projectId) || !isUuid(variationId) || !isUuid(attachmentId)) {
    return NextResponse.json({ error: "project_id, variation_id, and attachment_id are required." }, { status: 400 });
  }

  try {
    const supabase = await getAuthenticatedClient(request);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const { data: contextRows, error: contextError } = await supabase.rpc(
      "resolve_mobile_project_member_context_v2",
      { p_project_id: projectId },
    );
    const context = contextRows?.[0];
    if (contextError || !context) {
      return NextResponse.json({ error: "Attachment is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const { data: attachment, error: attachmentError } = await supabase
      .from("project_variation_attachments")
      .select("id, project_id, variation_id, organization_id, file_name, file_kind, storage_path, external_url")
      .eq("id", attachmentId)
      .eq("project_id", projectId)
      .eq("variation_id", variationId)
      .eq("organization_id", context.organization_id)
      .maybeSingle();

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: "Attachment is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (attachment.external_url && !attachment.storage_path) {
      return NextResponse.json(
        { kind: "external", url: attachment.external_url, file_name: attachment.file_name, file_kind: attachment.file_kind },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const storagePath = attachment.storage_path?.trim();
    const expectedPrefix = `${context.organization_id}/${projectId}/${variationId}/`;
    if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Attachment file is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const { data: signed, error: signedUrlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS);
    if (signedUrlError || !signed?.signedUrl) {
      return NextResponse.json({ error: "Attachment file is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      {
        kind: "storage",
        signed_url: signed.signedUrl,
        expires_in: SIGNED_URL_SECONDS,
        file_name: attachment.file_name,
        file_kind: attachment.file_kind,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[mobile-variation-attachment-download] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Unable to load attachment." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
