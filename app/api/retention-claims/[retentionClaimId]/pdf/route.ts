import { NextResponse } from "next/server";
import { downloadRetentionClaimDocument } from "@/lib/retention/phase8-retention-documents";

function safeHeaderFileName(value: string) {
  return value.replace(/[\r\n"]/g, "").slice(0, 250) || "Retention-Claim.pdf";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ retentionClaimId: string }> },
) {
  const { retentionClaimId } = await context.params;
  try {
    const result = await downloadRetentionClaimDocument(retentionClaimId);
    if (!result.succeeded) {
      const status =
        result.errorCode === "permission_denied"
        || result.errorCode === "capability_disabled"
          ? 403
          : 404;
      return NextResponse.json(
        { error: result.errorCode ?? "document_not_found" },
        { status },
      );
    }
    if (!result.document || !("bytes" in result)) {
      return NextResponse.json(
        { error: "document_not_generated" },
        { status: 404 },
      );
    }
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `attachment; filename="${safeHeaderFileName(result.document.fileName)}"`,
        "Content-Length": String(result.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Retention-Document-SHA256": result.document.pdfSha256,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "document_download_failed" },
      { status: 500 },
    );
  }
}
