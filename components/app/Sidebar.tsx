"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BrainCircuit,
  ChevronDown,
  ClipboardCheck,
  FolderKanban,
  LayoutGrid,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizationProjects } from "@/hooks/use-organization-projects";
import { interBold, interMedium } from "@/lib/fonts";
import { mainDashboardNav, projectDashboardNav } from "@/lib/nav";
import { formatProjectNameFromSlug } from "@/lib/projects";
import { mockUser } from "@/lib/mock";
import { cn } from "@/lib/utils";

const iconMap = {
  LayoutGrid,
  FolderKanban,
};

const projectIconMap = {
  LayoutGrid,
  BrainCircuit,
  ClipboardCheck,
  RefreshCw,
  MessagesSquare
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SidebarNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { session } = useAuth();
  const { projects, isLoading: isProjectsLoading } = useOrganizationProjects();
  const [isProjectSpaceExpanded, setIsProjectSpaceExpanded] = useState(true);

  const displayName = session?.name ?? mockUser.name;
  const initials = getInitials(displayName) || mockUser.initials;

  const isProjectSpaceOpen = pathname.startsWith("/app/projects") || isProjectSpaceExpanded;
  const pathnameParts = pathname.split("/").filter(Boolean);
  const routeProjectSlug = pathnameParts[1] === "projects" ? pathnameParts[2] ?? null : null;
  const isProjectContext = Boolean(routeProjectSlug && routeProjectSlug !== "new");
  const projectBasePath = routeProjectSlug ? `/app/projects/${routeProjectSlug}` : null;
  const isProjectDashboardRoute = Boolean(
    projectBasePath && (pathname === projectBasePath || pathname === `${projectBasePath}/dashboard`)
  );
  const projectBackHref = projectBasePath
    ? isProjectDashboardRoute
      ? "/app/dashboard"
      : `${projectBasePath}/dashboard`
    : "/app/dashboard";
  const projectBackLabel = isProjectDashboardRoute ? "Back to Main Dashboard" : "Back to Project Dashboard";
  const activeProject = routeProjectSlug ? projects.find((project) => project.slug === routeProjectSlug) ?? null : null;
  const activeProjectName =
    activeProject?.name ?? (routeProjectSlug && routeProjectSlug !== "new" ? formatProjectNameFromSlug(routeProjectSlug) : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/app/dashboard" className="inline-flex items-center px-2" onClick={onNavigate}>
        <Image
          src="/tradesstacklogowhite.png"
          alt="TradesStack"
          width={220}
          height={52}
          className="h-[4.1rem] w-auto"
          priority
        />
      </Link>

      {isProjectContext ? (
        <div className="mt-7 min-h-0 flex flex-1 flex-col">
          {activeProject ? (
            <div className="mb-5 px-1">
              <p className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6C8AA6]/60`}>
                Project
              </p>
              <p className="mt-2 break-words text-[18px] font-semibold leading-tight text-white" title={activeProjectName ?? undefined}>
                {activeProjectName}
              </p>
            </div>
          ) : activeProjectName ? (
            <div className="mb-5 px-1">
              <p className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6C8AA6]/60`}>
                Project
              </p>
              <p className="mt-2 break-words text-[18px] font-semibold leading-tight text-white" title={activeProjectName}>
                {activeProjectName}
              </p>
            </div>
          ) : null}

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {projectDashboardNav.map((item) => {
              const href = `/app/projects/${routeProjectSlug}/${item.segment}`;
              const isBaseProjectPath = pathname === `/app/projects/${routeProjectSlug}`;
              const isActive = pathname.startsWith(href) || (isBaseProjectPath && item.segment === "dashboard");
              const Icon = projectIconMap[item.icon];

              return (
                <Link
                  key={item.label}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex h-[44px] items-center gap-3 rounded-none px-3 text-[15px] font-medium transition-colors",
                    isActive
                      ? "border-l-[3px] border-l-[#F74917] bg-white/6 text-white"
                      : "text-white/75 hover:bg-white/12 hover:text-white"
                  )}
                >
                  <Icon className={cn("h-4.5 w-4.5", isActive ? "text-white" : "text-white/78 group-hover:text-white")} />
                  <span className={interBold.className}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            href={projectBackHref}
            onClick={onNavigate}
            className={`${interMedium.className} mt-5 inline-flex h-10 w-auto items-center whitespace-nowrap rounded-[8px] bg-[#F74917] px-[14px] text-[14px] font-medium text-white transition-colors hover:bg-[#E63F10]`}
          >
            <ArrowLeft className="mr-2 h-3.5 w-3.5 shrink-0" />
            {projectBackLabel}
          </Link>
        </div>
      ) : (
        <nav className="mt-7 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {mainDashboardNav.map((item) => {
            if (item.label === "Settings") {
              return null;
            }

            const Icon = iconMap[item.icon];
            const isProjectSpace = item.label === "Project Space";
            const isActive = pathname.startsWith(item.href);

            if (isProjectSpace) {
              return (
                <div key={item.label} className="space-y-1">
                  <div className="mx-3 mb-3 h-px bg-white/12" />
                  <button
                    type="button"
                    onClick={() => setIsProjectSpaceExpanded((current) => !current)}
                    className={cn(
                      "group flex h-[44px] w-full items-center justify-between rounded-none px-3 text-[15px] font-medium transition-colors",
                      isActive
                        ? "border-l-[3px] border-l-[#F74917] bg-white/6 text-white"
                        : "text-white/75 hover:bg-white/12 hover:text-white"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={cn("h-4.5 w-4.5", isActive ? "text-white" : "text-white/78 group-hover:text-white")} />
                      <span className={interBold.className}>{item.label}</span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isProjectSpaceOpen ? "rotate-180" : "rotate-0")} />
                  </button>

                  {isProjectSpaceOpen ? (
                    <div className="space-y-0.5 pl-4 pt-0.5">
                      {isProjectsLoading ? (
                        <p className={`${interMedium.className} px-4 py-2 text-xs font-medium text-white/60`}>Loading projects...</p>
                      ) : projects.length > 0 ? (
                        projects.map((project) => {
                          const projectHref = `/app/projects/${project.slug}/dashboard`;
                          const projectActive = pathname.startsWith(`/app/projects/${project.slug}`);

                          return (
                            <Link
                              key={project.id}
                              href={projectHref}
                              onClick={onNavigate}
                              className={cn(
                                "mb-0.5 flex h-[32px] items-center rounded-[10px] px-3 text-[14px] font-medium transition-colors",
                                projectActive
                                  ? "bg-white/10 text-white"
                                  : "text-white/75 hover:bg-white/6 hover:text-white"
                              )}
                            >
                              <span className={cn(interBold.className, "truncate")}>{project.name}</span>
                            </Link>
                          );
                        })
                      ) : (
                        <p className={`${interMedium.className} px-4 py-2 text-xs font-medium text-white/60`}>No projects yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex h-[44px] items-center gap-3 rounded-none px-3 text-[15px] font-medium transition-colors",
                  isActive
                    ? "border-l-[3px] border-l-[#F74917] bg-white/6 text-white"
                    : "text-white/75 hover:bg-white/12 hover:text-white"
                )}
              >
                <Icon className={cn("h-4.5 w-4.5", isActive ? "text-white" : "text-white/78 group-hover:text-white")} />
                <span className={interBold.className}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mt-8 h-px w-full bg-white/12" />

      <div className="px-3 pt-5">
        <Link
          href="/app/settings"
          className="-mx-2 flex items-center gap-3 rounded-[8px] px-2 py-1 transition-colors hover:bg-white/6"
          title={displayName}
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F74917] text-[15px] font-semibold text-white">
            {initials}
          </span>
          <span className={`${interMedium.className} truncate text-[15px] font-semibold text-white`}>
            {displayName}
          </span>
        </Link>
      </div>
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-[268px] shrink-0 self-start flex-col overflow-hidden rounded-none bg-[#04234D] px-5 py-7 shadow-[0_14px_28px_rgba(6,26,37,0.34)] lg:flex",
        className
      )}
    >
      <SidebarNavContent />
    </aside>
  );
}
