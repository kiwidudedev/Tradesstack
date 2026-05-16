"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  ClipboardCheck,
  Clock3,
  DollarSign,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Landmark,
  Shield,
  ShieldCheck,
  TimerReset,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROJECT_TOP_NAV_ITEMS = [
  { label: "Overview", segment: "dashboard", icon: LayoutGrid },
  { label: "Quotation", segment: "preconstruction/quote", icon: FileText },
  { label: "Tasks", segment: "job-management/todos", icon: ClipboardCheck },
  { label: "Variations", segment: "preconstruction/variations", icon: WandSparkles },
  { label: "Purchase Orders", segment: "preconstruction/purchase-orders", icon: FileSpreadsheet },
  { label: "Payment Claim", segment: "preconstruction/claims", icon: DollarSign },
  { label: "Financials", segment: "financials", icon: Landmark },
  { label: "Timesheets", segment: "job-management/time-sheets", icon: TimerReset },
  { label: "QA", segment: "job-management/quality-assurance", icon: ShieldCheck },
  { label: "Site Safety", segment: "site-safety", icon: Shield },
  { label: "AI Assistant", segment: "ai-chatbot", icon: Bot },
] as const;

export function ProjectSecondaryNav({
  projectName,
}: {
  projectName: string;
  projectStage?: string | null;
}) {
  const pathname = usePathname();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? "";
  const dashboardHref = `/app/projects/${projectId}/dashboard`;
  const isDashboardRoute = pathname === `/app/projects/${projectId}` || pathname === dashboardHref;

  return (
    <div className="shadow-none">
      <div className="flex flex-col gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[45px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]">
            {projectName}
          </h2>
        </div>

        {isDashboardRoute ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/projects" prefetch>
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="sticky top-14 z-20 border-b border-[var(--border)] bg-[var(--background)] px-5">
        <nav className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-8">
            {PROJECT_TOP_NAV_ITEMS.map((item) => {
              const href = `/app/projects/${projectId}/${item.segment}`;
              const isDashboard = item.segment === "dashboard";
              const isActive = isDashboard
                ? pathname === `/app/projects/${projectId}` || pathname === href
                : pathname.startsWith(href);
              const Icon = item.icon ?? Clock3;

              return (
                <Link
                  key={item.segment}
                  href={href}
                  className={cn(
                    "group -mx-[0.35rem] inline-flex items-center gap-2 border-b-2 px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors",
                    isActive
                      ? "border-[var(--orange-primary)] text-[var(--brand-blue)]"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon
                    strokeWidth={2.2}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
