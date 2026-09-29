import { AppShellFrame } from "@/components/app/AppShellFrame";
import { BrandThemeProvider } from "@/components/app/BrandThemeProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { SidebarStateProvider } from "@/components/app/SidebarState";
import { Topbar } from "@/components/app/Topbar";
import { WorkspaceSidebarBackdrop } from "@/components/app/WorkspaceSidebarBackdrop";
import { getCurrentOrganizationBranding } from "@/lib/branding-server";
import { getMasterClientConfig } from "@/lib/client-config";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const clientConfig = getMasterClientConfig();
  const [branding, member] = await Promise.all([
    getCurrentOrganizationBranding(),
    getCurrentOrganizationMember(),
  ]);
  const canViewPaymentClaims = member
    ? await hasOrganizationPermission(
        member.organization_id,
        "accounting.sales_invoices.view",
      )
    : false;

  return (
    <BrandThemeProvider
      platformColor={branding.platformColor ?? clientConfig.theme.platformColor}
      actionColor={branding.actionColor ?? clientConfig.theme.actionColor}
    >
      <SidebarStateProvider>
        <div className="relative min-h-screen bg-[var(--background)]">
          <Topbar canViewPaymentClaims={canViewPaymentClaims} />
          <div className="relative flex min-h-[calc(100vh-3.5rem)] w-full items-start gap-0 pt-14">
            <WorkspaceSidebarBackdrop />
            <Sidebar canViewPaymentClaims={canViewPaymentClaims} />
            <AppShellFrame>{children}</AppShellFrame>
          </div>
        </div>
      </SidebarStateProvider>
    </BrandThemeProvider>
  );
}
