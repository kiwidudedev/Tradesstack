import { NextResponse } from "next/server";
import { completeXeroOAuthCallback, getCurrentXeroCallbackUserId } from "@/lib/xero/service";
import { enqueueOrganizationXeroSync, runXeroSyncWorker } from "@/lib/xero/sync";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim() ?? "";
  const state = searchParams.get("state")?.trim() ?? "";
  const error = searchParams.get("error")?.trim() ?? "";
  const errorDescription = searchParams.get("error_description")?.trim() ?? "";

  if (error) {
    const redirectUrl = new URL("/app/settings/integrations", request.url);
    redirectUrl.searchParams.set("error", errorDescription || error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state) {
    const redirectUrl = new URL("/app/settings/integrations", request.url);
    redirectUrl.searchParams.set("error", "Xero did not return a valid authorization code and state.");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const currentUserId = await getCurrentXeroCallbackUserId();
    if (!currentUserId) {
      const redirectUrl = new URL("/app/settings/integrations", request.url);
      redirectUrl.searchParams.set("error", "Sign in again before completing the Xero connection.");
      return NextResponse.redirect(redirectUrl);
    }

    const result = await completeXeroOAuthCallback({ code, state, currentUserId });
    const redirectUrl = new URL(result.redirectPath || "/app/settings/integrations", request.url);

    if (result.autoSelectedTenant) {
      const createdJobs = await enqueueOrganizationXeroSync({
        organizationId: result.organizationId,
        connectionId: result.connection.id,
        createdByUserId: result.connection.connected_by_user_id,
        triggerSource: "oauth_callback",
        includeHealthCheck: true,
        includeContacts: true,
      });

      await runXeroSyncWorker({
        organizationId: result.organizationId,
        limit: createdJobs.jobs.length,
        workerId: "xero-oauth-callback",
      });

      redirectUrl.searchParams.set("message", "Xero connected and reference data plus contacts imported.");
      return NextResponse.redirect(redirectUrl);
    }

    redirectUrl.searchParams.set("message", "Xero connected. Select the tenant to finish setup.");
    return NextResponse.redirect(redirectUrl);
  } catch (callbackError) {
    const redirectUrl = new URL("/app/settings/integrations", request.url);
    redirectUrl.searchParams.set(
      "error",
      callbackError instanceof Error ? callbackError.message : "Unable to complete the Xero connection.",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
