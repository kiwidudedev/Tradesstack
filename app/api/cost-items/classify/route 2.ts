import { NextResponse } from "next/server";
import { classifyCurrentCostItemsForDocument, type CostItemDocumentKind } from "@/lib/cost-items/classification-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  documentKind?: CostItemDocumentKind;
  documentId?: string;
  force?: boolean;
};

const SUPPORTED_DOCUMENT_KINDS = new Set<CostItemDocumentKind>([
  "opportunity_quote",
  "project_quote",
  "project_variation",
  "project_purchase_order",
  "project_claim",
]);

function isValidDocumentKind(value: unknown): value is CostItemDocumentKind {
  return typeof value === "string" && SUPPORTED_DOCUMENT_KINDS.has(value as CostItemDocumentKind);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidDocumentKind(body.documentKind)) {
    return NextResponse.json({ error: "Unsupported or missing documentKind." }, { status: 400 });
  }

  if (typeof body.documentId !== "string" || body.documentId.trim().length === 0) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  try {
    const result = await classifyCurrentCostItemsForDocument(body.documentKind, body.documentId.trim(), {
      force: body.force === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to classify cost items.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
