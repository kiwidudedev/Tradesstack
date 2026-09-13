import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { purgeExpiredMaterialImportSources, runMaterialSupplierPricingWorker } from "@/lib/materials/import-job-service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return { ok: false as const, status: 500, error: "Missing CRON_SECRET environment variable." };
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (supplied !== secret) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isBackgroundJobEnabled("material-supplier-pricing")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }
  try {
    const [job, retention] = await Promise.all([runMaterialSupplierPricingWorker(), purgeExpiredMaterialImportSources()]);
    return NextResponse.json({ ...job, retention });
  } catch (error) {
    return NextResponse.json({ error: "Worker failed." }, { status: 500 });
  }
}

export const GET = POST;
