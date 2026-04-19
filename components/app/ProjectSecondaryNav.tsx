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
  ShieldCheck,
  TimerReset,
  WandSparkles,
} from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

const PROJECT_TOP_NAV_ITEMS = [
  { label: "Overview", segment: "dashboard", icon: LayoutGrid },
  { label: "Quotation", segment: "preconstruction/quote", icon: FileText },
  { label: "Tasks", segment: "job-management/todos", icon: ClipboardCheck },
  { label: "Variations", segment: "preconstruction/variations", icon: WandSparkles },
  { label: "Purchase Orders", segment: "preconstruction/purchase-orders", icon: FileSpreadsheet },
  { label: "Payment Claim", segment: "preconstruction/claims", icon: DollarSign },
  { label: "Timesheets", segment: "job-management/time-sheets", icon: TimerReset },
  { label: "Health & Safety", segment: "job-management/quality-assurance", icon: ShieldCheck },
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
    <div className="bg-white shadow-none">
      <div className="flex flex-col gap-3 bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center">
            <h2 className={`${ibmPlexSans.className} truncate text-[1.7rem] font-bold leading-none tracking-[-0.03em] text-[#1d1d1d]`}>
              {projectName}
            </h2>
          </div>
        </div>

        {isDashboardRoute ? (
          <Link
            href="/app/projects"
            className="inline-flex items-center gap-[0.4rem] rounded-[0.9rem] border border-[#CBD5E1] bg-white px-4 py-2 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        ) : null}
      </div>

      <div className="sticky top-0 z-20 border-b-2 bg-white px-5" style={{ borderBottomColor: "#E2E8F1" }}>
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
                    "group -mx-[0.35rem] inline-flex items-center gap-2 px-[0.35rem] py-3 text-[15px] font-medium transition-colors",
                    isActive
                      ? "text-[#F15A29]"
                      : "text-[#4B5D79] hover:text-[#4B5D79]"
                  )}
                  style={isActive ? { borderBottomWidth: "2px", borderBottomStyle: "solid", borderBottomColor: "#F15A29" } : undefined}
                >
                  <Icon
                    strokeWidth={2.2}
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-[#F15A29]" : "text-[#4B5D79] group-hover:text-[#4B5D79]"
                    )}
                  />
                  <span className="whitespace-nowrap text-[15px] leading-none">
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
