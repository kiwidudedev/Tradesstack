"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  ClipboardCheck,
  DollarSign,
  FileText,
  FolderOpen,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  TimerReset,
  WandSparkles,
} from "lucide-react";
import { interMedium } from "@/lib/fonts";
import { cn } from "@/lib/utils";

const graphikRegularTextStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
  fontWeight: 400,
} as const;

const PROJECT_TOP_NAV_ITEMS = [
  { label: "Project Dashboard", segment: "dashboard", icon: LayoutGrid },
  { label: "Scope / Pricing", segment: "preconstruction/quote", icon: FileText },
  { label: "Tasks", segment: "job-management/todos", icon: ClipboardCheck },
  { label: "Variations", segment: "preconstruction/variations", icon: WandSparkles },
  { label: "Financials", segment: "preconstruction/claims", icon: DollarSign },
  { label: "Files", segment: "drawing-intelligence", icon: FolderOpen },
  { label: "Timeline", segment: "job-management/time-sheets", icon: TimerReset },
  { label: "Health & Safety", segment: "job-management/quality-assurance", icon: ShieldCheck },
  { label: "AI Assistant", segment: "ai-chatbot", icon: Sparkles },
] as const;

function formatStageLabel(stage: string | null | undefined) {
  if (!stage) {
    return "Project";
  }

  if (stage === "Pricing") {
    return "In Progress";
  }

  return stage;
}

export function ProjectSecondaryNav({
  projectName,
  projectStage,
}: {
  projectName: string;
  projectStage?: string | null;
}) {
  const pathname = usePathname();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? "";

  return (
    <div className="app-surface overflow-hidden rounded-[26px] border border-[var(--app-border)] shadow-none">
      <div className="flex flex-col gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
          <Link
            href="/app/projects"
            className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[#4E5E6D] transition-colors hover:text-[#10283B] xl:border-r xl:border-[#DCE6EA] xl:pr-6"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
            <span className="text-[13px] font-semibold" style={graphikRegularTextStyle}>
              Back to Projects
            </span>
          </Link>

          <div className="min-w-0 xl:pl-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="truncate text-[20px] font-semibold leading-none tracking-[-0.03em] text-[#10283B]">
                {projectName}
              </h2>
              <span
                className={`${interMedium.className} inline-flex rounded-full bg-[#D7EAF3] px-3 py-1 text-[12px] font-semibold text-[#18384C]`}
              >
                {formatStageLabel(projectStage)}
              </span>
              <span className={`${interMedium.className} text-[12px] text-[#7E8794]`}>Project #1</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[#E2EAEE] px-5 py-3">
        <nav className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-2.5">
            {PROJECT_TOP_NAV_ITEMS.map((item) => {
              const href = `/app/projects/${projectId}/${item.segment}`;
              const isDashboard = item.segment === "dashboard";
              const isActive = isDashboard
                ? pathname === `/app/projects/${projectId}` || pathname === href
                : pathname.startsWith(href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.segment}
                  href={href}
                  className={cn(
                    "group inline-flex min-h-[38px] items-center gap-2.5 rounded-[16px] px-3.5 text-[14px] font-medium transition-all",
                    isActive
                      ? "bg-[#10283B] text-white shadow-none"
                      : "text-[#445668] hover:bg-[#EEF5F5] hover:text-[#10283B]"
                  )}
                >
                  <Icon
                    strokeWidth={2.2}
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-white" : "text-[#4E5E6D] group-hover:text-[#10283B]"
                    )}
                  />
                  <span className="whitespace-nowrap text-[13px] font-semibold leading-none" style={graphikRegularTextStyle}>
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
