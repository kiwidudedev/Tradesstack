import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  generateInvoicePdfBundleServer,
  InvoicePdfServerError,
} from "@/lib/exports/invoice-pdf-server";
import {
  getCurrentOrganizationMember,
  getCurrentOrganizationMemberWithTiming,
} from "@/lib/projects-server";
import { createPdfExportTiming } from "@/lib/exports/pdf-export-timing";

export const runtime = "nodejs";

function safeHeaderFileName(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220) || "Invoice.pdf";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  const requestedExportId = request.headers.get("x-pdf-export-id") ?? "";
  const exportId = /^[a-zA-Z0-9-]{1,80}$/.test(requestedExportId)
    ? requestedExportId
    : randomUUID();
  const timing = createPdfExportTiming({
    enabled: process.env.PDF_EXPORT_TIMING === "1",
    exportId,
    kind: "invoice-server",
  });
  timing.mark("route-entered");
  timing.start("authentication");
  const member = timing.enabled
    ? await getCurrentOrganizationMemberWithTiming((stage) => {
        if (stage === "authentication-completed") {
          timing.end("authentication");
          timing.start("membership");
        } else {
          timing.end("membership");
        }
      })
    : await getCurrentOrganizationMember();
  if (!member) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }

  const { claimId } = await context.params;
  try {
    const result = await generateInvoicePdfBundleServer({
      organizationId: member.organization_id,
      claimId,
      ...(timing.enabled ? { timing } : {}),
    });
    const response = new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `attachment; filename="${safeHeaderFileName(result.fileName)}"`,
        "Content-Length": String(result.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    timing.mark("response-created");
    const serverTiming = timing.serverTimingHeader();
    if (serverTiming) {
      response.headers.set("Server-Timing", serverTiming);
      response.headers.set("X-Pdf-Export-Id", exportId);
    }
    timing.report({ outcome: "success" });
    return response;
  } catch (error) {
    timing.report({ outcome: "error" });
    if (error instanceof InvoicePdfServerError) {
      const status = error.code === "not_found"
        ? 404
        : error.code === "ineligible_status"
          ? 409
          : 422;
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status },
      );
    }
    return NextResponse.json(
      {
        error: "invoice_export_failed",
        message: "The invoice PDF could not be generated.",
      },
      { status: 500 },
    );
  }
}
