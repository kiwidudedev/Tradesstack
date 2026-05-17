"use client";

import { usePathname } from "next/navigation";
import { OpportunityWorkspaceShell } from "@/components/app/OpportunityWorkspaceShell";

function getActiveOpportunityTab(pathname: string, opportunityId: string) {
  const basePath = `/app/leads-clients/opportunities/${opportunityId}`;

  if (pathname.startsWith(`${basePath}/takeoff`)) {
    return "takeoff" as const;
  }

  if (pathname.startsWith(`${basePath}/drawing-intelligence`)) {
    return "generate-trade-pack" as const;
  }

  if (pathname.startsWith(`${basePath}/scope-builder`)) {
    return "build-scope" as const;
  }

  if (pathname.startsWith(`${basePath}/quote`)) {
    return "start-pricing" as const;
  }

  if (pathname.startsWith(`${basePath}/pricing-worksheet`)) {
    return "pricing-worksheet" as const;
  }

  return "overview" as const;
}

export function OpportunityWorkspaceLayoutShell({
  title,
  opportunityId,
  children,
}: {
  title: string;
  opportunityId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeTab = getActiveOpportunityTab(pathname, opportunityId);

  return (
    <OpportunityWorkspaceShell title={title} opportunityId={opportunityId} activeTab={activeTab}>
      {children}
    </OpportunityWorkspaceShell>
  );
}
