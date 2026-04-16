import Link from "next/link";
import { ArrowLeft, FileText, FolderOpen, LayoutGrid } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import {
  leadsButtonLabelStyle,
  leadsPageSurfaceTheme,
  leadsShellActionClassName,
  leadsShellHeaderClassName,
  leadsShellTabClassName,
  leadsShellTabRowClassName,
  leadsShellTitleStyle,
  leadsTabLabelStyle,
} from "@/components/app/LeadsPagePrimitives";

type OpportunityTab = "overview" | "generate-trade-pack" | "build-scope" | "start-pricing";

export function OpportunityWorkspaceShell({
  title,
  opportunityId,
  activeTab,
  children,
  titleClassName,
  contentClassName = "bg-[#FBFEFE] px-5 pt-6",
}: {
  title: string;
  opportunityId: string;
  activeTab: OpportunityTab;
  children: React.ReactNode;
  titleClassName?: string;
  contentClassName?: string;
}) {
  const navItems = [
    {
      label: "Overview",
      href: `/app/leads-clients/opportunities/${opportunityId}`,
      icon: LayoutGrid,
      active: activeTab === "overview",
    },
    {
      label: "Generate Trade Pack",
      href: `/app/leads-clients/opportunities/${opportunityId}/drawing-intelligence`,
      icon: FolderOpen,
      active: activeTab === "generate-trade-pack",
    },
    {
      label: "Build Scope",
      href: `/app/leads-clients/opportunities/${opportunityId}/scope-builder`,
      icon: FileText,
      active: activeTab === "build-scope",
    },
    {
      label: "Start Pricing",
      href: `/app/leads-clients/opportunities/${opportunityId}/quote`,
      icon: FileText,
      active: activeTab === "start-pricing",
    },
  ] as const;

  return (
    <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme app-canvas -mx-[0.384rem] pb-8 sm:-mx-[1.024rem]`}>
      <div className={leadsShellHeaderClassName}>
        <div className={`${leadsShellHeaderClassName} shadow-none`}>
          <div className={`flex flex-col gap-3 ${leadsShellHeaderClassName} px-5 py-4 xl:flex-row xl:items-center xl:justify-between`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center">
                <h2
                  className={titleClassName ?? `${ibmPlexSans.className} truncate`}
                  style={titleClassName ? undefined : leadsShellTitleStyle}
                >
                  {title}
                </h2>
              </div>
            </div>

            <Link
              href="/app/leads-clients/opportunities"
              prefetch
              className={leadsShellActionClassName}
            >
              <ArrowLeft className="h-4 w-4" />
              <span style={leadsButtonLabelStyle}>Back to Opportunities</span>
            </Link>
          </div>

          <div className={leadsShellTabRowClassName} style={{ borderBottomColor: leadsPageSurfaceTheme.border }}>
            <nav className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-8">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      prefetch
                      className={`${leadsShellTabClassName} ${
                        item.active
                          ? "border-b-2 text-[#F15A29]"
                          : "border-b-0 text-[#4B5D79] hover:text-[#4B5D79]"
                      }`}
                      style={
                        item.active
                          ? { borderBottomStyle: "solid", borderBottomColor: leadsPageSurfaceTheme.accent }
                          : undefined
                      }
                    >
                      <Icon
                        strokeWidth={2.2}
                        className={`h-4 w-4 shrink-0 ${item.active ? "text-[#F15A29]" : "text-[#4B5D79] group-hover:text-[#4B5D79]"}`}
                      />
                      <span
                        className="whitespace-nowrap"
                        style={item.active ? { ...leadsTabLabelStyle, color: leadsPageSurfaceTheme.accent } : leadsTabLabelStyle}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>

      <div className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
