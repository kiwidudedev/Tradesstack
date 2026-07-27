import { NextResponse } from "next/server";
import { createSupplierInvoiceCaptureFromFormData } from "@/lib/supplier-invoice-capture";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid multipart request." }, { status: 400 });
  }

  const result = await createSupplierInvoiceCaptureFromFormData(formData);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
