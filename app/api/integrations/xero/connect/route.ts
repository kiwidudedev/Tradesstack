import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createXeroAuthorizationUrl } from "@/lib/xero/service";

export async function GET(request: Request) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const canManage = await hasOrganizationPermission(
    currentMember.organization_id,
    "settings.organization.update",
  );

  if (!canManage) {
    return NextResponse.redirect(
      new URL("/app/settings/integrations?error=You+do+not+have+permission+to+connect+Xero.", request.url),
    );
  }

  const authorizeUrl = await createXeroAuthorizationUrl({
    organizationId: currentMember.organization_id,
    userId: currentMember.user_id,
  });

  return NextResponse.redirect(authorizeUrl);
}
