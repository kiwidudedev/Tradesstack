import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { processSupplierInvoiceDocumentExtraction } from "@/lib/supplier-invoice-document-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  supplierInvoiceId?: unknown;
  extractionId?: unknown;
};

export async function POST(request: Request) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return NextResponse.json(
      { error: "You do not have permission to perform this Accounts action." },
      { status: 403 }
    );
  }

  const canCapture = await hasOrganizationPermission(
    currentMember.organization_id,
    "supplier_invoices.capture"
  );
  if (!canCapture) {
    return NextResponse.json(
      { error: "You do not have permission to perform this Accounts action." },
      { status: 403 }
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supplierInvoiceId =
    typeof body.supplierInvoiceId === "string" && body.supplierInvoiceId.trim().length > 0
      ? body.supplierInvoiceId.trim()
      : null;
  const extractionId =
    typeof body.extractionId === "string" && body.extractionId.trim().length > 0
      ? body.extractionId.trim()
      : null;

  if (!supplierInvoiceId || !extractionId) {
    return NextResponse.json(
      { error: "supplierInvoiceId and extractionId are required." },
      { status: 400 }
    );
  }

  try {
    const extraction = await processSupplierInvoiceDocumentExtraction({
      supabase: await createServerSupabaseClient(),
      organizationId: currentMember.organization_id,
      userId: currentMember.user_id,
      supplierInvoiceId,
      extractionId,
    });

    return NextResponse.json({ ok: true, extraction });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to process Supplier Invoice extraction.",
      },
      { status: 500 }
    );
  }
}
