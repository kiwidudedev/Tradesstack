import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  createXeroAuthorizationAttempt,
  XeroOAuthFlowError,
} from "@/lib/xero/service";

function integrationErrorRedirect(request: Request, code: string, correlationId: string) {
  const url = new URL("/app/settings/integrations", request.url);
  url.searchParams.set("error_code", code);
  url.searchParams.set("correlation_id", correlationId);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestCorrelationId = randomUUID();
  try {
    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    const canManage = await hasOrganizationPermission(
      currentMember.organization_id,
      "settings.organization.update",
    );

    if (!canManage) {
      console.warn("Xero connect rejected", {
        correlationId: requestCorrelationId,
        code: "xero_connect_not_authorized",
        organizationId: currentMember.organization_id,
      });
      return integrationErrorRedirect(request, "xero_connect_not_authorized", requestCorrelationId);
    }

    const attempt = await createXeroAuthorizationAttempt({
      organizationId: currentMember.organization_id,
      userId: currentMember.user_id,
    });

    console.info("Xero authorization redirect issued", {
      correlationId: attempt.correlationId,
      attemptId: attempt.attemptId,
      organizationId: currentMember.organization_id,
    });
    return NextResponse.redirect(attempt.authorizeUrl);
  } catch (error) {
    const correlationId = error instanceof XeroOAuthFlowError
      ? error.correlationId
      : requestCorrelationId;
    const code = error instanceof XeroOAuthFlowError
      ? error.code
      : "xero_connect_state_creation_failed";
    console.error("Xero connect failed", { correlationId, code });
    return integrationErrorRedirect(request, code, correlationId);
  }
}
