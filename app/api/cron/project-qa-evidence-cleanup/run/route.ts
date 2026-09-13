import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { runProjectQAEvidenceCleanup } from "@/lib/quality-assurance/execution/evidence-cleanup";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) return NextResponse.json({ error: "Missing CRON_SECRET environment variable." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isBackgroundJobEnabled("project-qa-evidence-cleanup")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }
  try {
    return NextResponse.json(await runProjectQAEvidenceCleanup());
  } catch (error) {
    console.error("[project-qa-evidence-cleanup] failed", { error: "Unknown failure" });
    return NextResponse.json({ error: "Project QA evidence cleanup failed." }, { status: 500 });
  }
}
