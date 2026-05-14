import { AppShellFrame } from "@/components/app/AppShellFrame";
import { BrandThemeProvider } from "@/components/app/BrandThemeProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { SidebarStateProvider } from "@/components/app/SidebarState";
import { Topbar } from "@/components/app/Topbar";
import { WorkspaceSidebarBackdrop } from "@/components/app/WorkspaceSidebarBackdrop";
import { getCurrentOrganizationBranding } from "@/lib/branding-server";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const branding = await getCurrentOrganizationBranding();

  return (
    <BrandThemeProvider
      platformColor={branding.platformColor}
      actionColor={branding.actionColor}
    >
      <SidebarStateProvider>
        <div className="relative min-h-screen bg-[var(--background)]">
          <Topbar />
          <div className="relative flex min-h-[calc(100vh-3.5rem)] w-full items-start gap-0 pt-14">
            <WorkspaceSidebarBackdrop />
            <Sidebar />
            <AppShellFrame>{children}</AppShellFrame>
          </div>
        </div>
      </SidebarStateProvider>
    </BrandThemeProvider>
  );
}
