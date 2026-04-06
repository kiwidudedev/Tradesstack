"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronDown,
  Clock3,
  ClipboardCheck,
  FileText,
  FolderKanban,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Bell,
  RefreshCw,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizationProjects } from "@/hooks/use-organization-projects";
import { interMedium } from "@/lib/fonts";
import { mainDashboardNav, projectDashboardNav } from "@/lib/nav";
import { formatProjectNameFromSlug } from "@/lib/projects";
import { mockUser } from "@/lib/mock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const graphikRegularTextStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
  fontWeight: 400,
} as const;

const sidebarItemBaseClass =
  "group relative flex h-[50px] items-center gap-3 rounded-[14px] px-4 text-[15px] font-medium transition-colors";

const sidebarButtonBaseClass =
  "group relative flex h-[50px] w-full items-center justify-between rounded-[14px] px-4 text-[15px] font-medium transition-colors";

const mainDashboardActiveClass =
  "bg-transparent text-[#d9e2ea] before:absolute before:-left-5 before:top-1/2 before:h-8 before:w-[6px] before:-translate-y-1/2 before:rounded-r-full before:bg-[#F74917]";

const sidebarItemActiveClass = "bg-white/7 text-white";

const sidebarItemInactiveClass = "text-white/72 hover:bg-white/10 hover:text-white";

const sidebarSubItemBaseClass =
  "group relative flex h-[38px] items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-colors";

const iconMap = {
  LayoutGrid,
  FolderKanban,
  Users,
};

const projectIconMap = {
  LayoutGrid,
  FolderKanban,
  BrainCircuit,
  FileText,
  ClipboardCheck,
  RefreshCw,
  MessagesSquare
};

const AI_INTELLIGENCE_SEGMENTS = new Set([
  "drawing-intelligence",
  "scope-builder",
  "spec-finishes-review",
  "change-detection",
]);

const JOB_MANAGEMENT_ITEMS = [
  { label: "Time Sheets", segment: "job-management/time-sheets" },
  { label: "Tasks", segment: "job-management/todos" },
  { label: "Quality Assurance", segment: "job-management/quality-assurance" },
] as const;

const LEADS_CLIENTS_ITEMS = [
  { label: "Opportunities", href: "/app/leads-clients/opportunities" },
  { label: "Clients", href: "/app/leads-clients/clients" },
] as const;

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
  const router = useRouter();
  const { session, logout } = useAuth();
  const { projects, isLoading: isProjectsLoading } = useOrganizationProjects();
  const [isLeadsClientsExpanded, setIsLeadsClientsExpanded] = useState(() => pathname.startsWith("/app/leads-clients"));
  const [isAiIntelligenceExpanded, setIsAiIntelligenceExpanded] = useState(false);
  const [isJobManagementExpanded, setIsJobManagementExpanded] = useState(() => pathname.includes("/job-management"));

  const displayName = session?.name ?? mockUser.name;
  const initials = getInitials(displayName) || mockUser.initials;

  const isLeadsClientsOpen = isLeadsClientsExpanded;
  const isLeadsClientsContext = pathname.startsWith("/app/leads-clients");
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
  const projectBackLabel = isProjectDashboardRoute ? "Back to Main Dashboard" : "Back to Dashboard";
  const activeProject = routeProjectSlug ? projects.find((project) => project.slug === routeProjectSlug) ?? null : null;
  const activeProjectName =
    activeProject?.name ?? (routeProjectSlug && routeProjectSlug !== "new" ? formatProjectNameFromSlug(routeProjectSlug) : null);
  const selectedProjectLabel = activeProjectName ?? "Select project";
  const projectDashboardItem = projectDashboardNav.find((item) => item.segment === "dashboard") ?? null;
  const preconstructionItem = projectDashboardNav.find((item) => item.segment === "preconstruction") ?? null;
  const aiAssistantItem = projectDashboardNav.find((item) => item.segment === "ai-chatbot") ?? null;
  const aiIntelligenceItems = projectDashboardNav.filter((item) => AI_INTELLIGENCE_SEGMENTS.has(item.segment));
  const [isPreconstructionExpanded, setIsPreconstructionExpanded] = useState(false);
  const preconstructionBaseHref = `/app/projects/${routeProjectSlug}/preconstruction`;
  const preconstructionQuoteHref = `${preconstructionBaseHref}/quote`;
  const preconstructionVariationsHref = `${preconstructionBaseHref}/variations`;
  const preconstructionPurchaseOrdersHref = `${preconstructionBaseHref}/purchase-orders`;
  const preconstructionClaimsHref = `${preconstructionBaseHref}/claims`;
  const isPreconstructionActive =
    pathname.startsWith(preconstructionBaseHref) ||
    pathname.startsWith(preconstructionQuoteHref) ||
    pathname.startsWith(preconstructionVariationsHref) ||
    pathname.startsWith(preconstructionPurchaseOrdersHref) ||
    pathname.startsWith(preconstructionClaimsHref);
  const shouldShowPreconstructionDetails = isPreconstructionExpanded || isPreconstructionActive;
  const jobManagementBaseHref = `/app/projects/${routeProjectSlug}/job-management`;
  const isJobManagementActive = pathname.startsWith(jobManagementBaseHref);
  const shouldShowJobManagementDetails = isJobManagementExpanded || isJobManagementActive;
  const isAiIntelligenceActive = aiIntelligenceItems.some((item) =>
    pathname.startsWith(`/app/projects/${routeProjectSlug}/${item.segment}`)
  );
  const shouldShowAiIntelligenceDetails = isAiIntelligenceExpanded || isAiIntelligenceActive;

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  function handleProjectSelect(projectSlug: string) {
    router.push(`/app/projects/${projectSlug}/dashboard`);
    onNavigate?.();
  }

  const projectSelector = (
    <div className="space-y-2">
      <p className={`${interMedium.className} mb-3 px-1 text-[15px] text-white/68`}>Projects</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-[58px] w-full items-center justify-between rounded-[16px] border border-white/12 bg-transparent px-3.5 text-left text-[#E6EDF3] transition hover:bg-[rgba(255,255,255,0.06)] data-[state=open]:bg-[rgba(255,255,255,0.10)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] text-[#E6EDF3]" style={graphikRegularTextStyle}>
                {isProjectsLoading && projects.length === 0 ? "Loading projects..." : selectedProjectLabel}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[#E6EDF3]" strokeWidth={2.3} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={10}
          className="w-[240px] rounded-[16px] border border-[#E5E7EB] bg-white p-2 shadow-[0_18px_40px_rgba(6,26,37,0.16)]"
        >
          {projects.length > 0 ? (
            projects.map((project) => {
              const isSelected = project.slug === routeProjectSlug;

              return (
                <DropdownMenuItem
                  key={project.id}
                  onSelect={() => handleProjectSelect(project.slug)}
                  className="flex h-11 cursor-pointer items-center justify-between rounded-[12px] px-3 text-[#061A25] focus:bg-[#F3F4F6] focus:text-[#061A25]"
                >
                  <span className="truncate text-[15px]" style={graphikRegularTextStyle}>
                    {project.name}
                  </span>
                  {isSelected ? <Check className="ml-3 h-4 w-4 shrink-0 text-[#F74917]" strokeWidth={2.6} /> : null}
                </DropdownMenuItem>
              );
            })
          ) : (
            <div className="px-3 py-2 text-[15px] text-[#6B7280]" style={graphikRegularTextStyle}>
              No projects yet
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F3F4F6]">
      <div className="px-6 pb-5 pt-6">
        <Link href="/app/dashboard" className="relative z-10 inline-flex items-center" onClick={onNavigate}>
          <Image
            src="/Tradesstack Logo Blue.png"
            alt="TradesStack"
            width={220}
            height={52}
            className="h-[4.1rem] w-auto"
            unoptimized
            priority
          />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-tr-[78px] bg-[#0b2639] px-5 py-10">
      {isProjectContext ? (
        <div className="mt-1 min-h-0 flex flex-1 flex-col">
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

          <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {projectDashboardItem ? (
              (() => {
                const href = `/app/projects/${routeProjectSlug}/${projectDashboardItem.segment}`;
                const isBaseProjectPath = pathname === `/app/projects/${routeProjectSlug}`;
                const isActive =
                  pathname.startsWith(href) || (isBaseProjectPath && projectDashboardItem.segment === "dashboard");
                const Icon = projectIconMap[projectDashboardItem.icon];

                return (
                  <Link
                    key={projectDashboardItem.label}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      sidebarItemBaseClass,
                      isActive ? sidebarItemActiveClass : sidebarItemInactiveClass
                    )}
                  >
                    <Icon strokeWidth={2.4} className={cn("h-4.5 w-4.5", isActive ? "text-white" : "text-white/78 group-hover:text-white")} />
                    <span style={graphikRegularTextStyle}>{projectDashboardItem.label}</span>
                  </Link>
                );
              })()
            ) : null}

            {preconstructionItem ? (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setIsPreconstructionExpanded((current) => !current)}
                  className={cn(
                      sidebarButtonBaseClass,
                    isPreconstructionActive ? sidebarItemActiveClass : sidebarItemInactiveClass
                  )}
                >
                  <span className="flex items-center gap-3">
                    <FolderKanban
                      strokeWidth={2.4}
                      className={cn(
                        "h-4.5 w-4.5",
                        isPreconstructionActive ? "text-white" : "text-white/78 group-hover:text-white"
                      )}
                    />
                    <span style={graphikRegularTextStyle}>Financial</span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", shouldShowPreconstructionDetails ? "rotate-180" : "rotate-0")}
                  />
                </button>

                {shouldShowPreconstructionDetails ? (
                  <div className="space-y-1.5 pl-4 pt-1">
                    <Link
                      href={preconstructionQuoteHref}
                      onClick={onNavigate}
                      className={cn(
                        sidebarSubItemBaseClass,
                        pathname.startsWith(preconstructionQuoteHref) ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                      )}
                    >
                      <FileText strokeWidth={2.4} className="h-4 w-4" />
                      <span style={graphikRegularTextStyle}>Quote</span>
                    </Link>
                    <Link
                      href={preconstructionVariationsHref}
                      onClick={onNavigate}
                      className={cn(
                        sidebarSubItemBaseClass,
                        pathname.startsWith(preconstructionVariationsHref) ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                      )}
                    >
                      <FileText strokeWidth={2.4} className="h-4 w-4" />
                      <span style={graphikRegularTextStyle}>Variations</span>
                    </Link>
                    <Link
                      href={preconstructionPurchaseOrdersHref}
                      onClick={onNavigate}
                      className={cn(
                        sidebarSubItemBaseClass,
                        pathname.startsWith(preconstructionPurchaseOrdersHref) ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                      )}
                    >
                      <FileText strokeWidth={2.4} className="h-4 w-4" />
                      <span style={graphikRegularTextStyle}>Purchase Orders</span>
                    </Link>
                    <Link
                      href={preconstructionClaimsHref}
                      onClick={onNavigate}
                      className={cn(
                        sidebarSubItemBaseClass,
                        pathname.startsWith(preconstructionClaimsHref) ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                      )}
                    >
                      <FileText strokeWidth={2.4} className="h-4 w-4" />
                      <span style={graphikRegularTextStyle}>Claims</span>
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsJobManagementExpanded((current) => !current)}
                className={cn(
                  sidebarButtonBaseClass,
                  isJobManagementActive ? sidebarItemActiveClass : sidebarItemInactiveClass
                )}
              >
                <span className="flex items-center gap-3">
                  <ClipboardCheck
                    strokeWidth={2.4}
                    className={cn(
                      "h-4.5 w-4.5",
                      isJobManagementActive ? "text-white" : "text-white/78 group-hover:text-white"
                    )}
                  />
                  <span style={graphikRegularTextStyle}>Job Management</span>
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", shouldShowJobManagementDetails ? "rotate-180" : "rotate-0")}
                />
              </button>

              {shouldShowJobManagementDetails ? (
                <div className="space-y-1.5 pl-4 pt-1">
                  {JOB_MANAGEMENT_ITEMS.map((item) => {
                    const href = `/app/projects/${routeProjectSlug}/${item.segment}`;
                    const isActive = pathname.startsWith(href);

                    return (
                      <Link
                        key={item.segment}
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          sidebarSubItemBaseClass,
                          isActive ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                        )}
                      >
                        <span style={graphikRegularTextStyle}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsAiIntelligenceExpanded((current) => !current)}
                className={cn(
                  sidebarButtonBaseClass,
                  isAiIntelligenceActive ? sidebarItemActiveClass : sidebarItemInactiveClass
                )}
              >
                <span className="flex items-center gap-3">
                  <BrainCircuit
                    strokeWidth={2.4}
                    className={cn(
                      "h-4.5 w-4.5",
                      isAiIntelligenceActive ? "text-white" : "text-white/78 group-hover:text-white"
                    )}
                  />
                  <span style={graphikRegularTextStyle}>AI Intelligence</span>
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", shouldShowAiIntelligenceDetails ? "rotate-180" : "rotate-0")}
                />
              </button>

              {shouldShowAiIntelligenceDetails ? (
                <div className="space-y-1.5 pl-4 pt-1">
                  {aiIntelligenceItems.map((item) => {
                    const href = `/app/projects/${routeProjectSlug}/${item.segment}`;
                    const isActive = pathname.startsWith(href);
                    const Icon = projectIconMap[item.icon];

                    return (
                      <Link
                        key={item.label}
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          sidebarSubItemBaseClass,
                          isActive ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                        )}
                      >
                        <Icon strokeWidth={2.4} className={cn("h-4 w-4", isActive ? "text-white" : "text-white/78 group-hover:text-white")} />
                        <span style={graphikRegularTextStyle}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {aiAssistantItem ? (
              (() => {
                const href = `/app/projects/${routeProjectSlug}/${aiAssistantItem.segment}`;
                const isActive = pathname.startsWith(href);
                const Icon = projectIconMap[aiAssistantItem.icon];

                return (
                  <Link
                    key={aiAssistantItem.label}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      sidebarItemBaseClass,
                      isActive ? sidebarItemActiveClass : sidebarItemInactiveClass
                    )}
                  >
                    <Icon strokeWidth={2.4} className={cn("h-4.5 w-4.5", isActive ? "text-white" : "text-white/78 group-hover:text-white")} />
                    <span style={graphikRegularTextStyle}>{aiAssistantItem.label}</span>
                  </Link>
                );
              })()
            ) : null}
          </nav>

        </div>
      ) : (
        <div className="mt-3.5 min-h-0 flex flex-1 flex-col">
          <div className="pb-6">
            <div>{projectSelector}</div>
            <div className="mt-5 h-px w-full bg-white/12" />
          </div>

          <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {mainDashboardNav.map((item) => {
            if (item.label === "Settings") {
              return null;
            }

            const Icon = iconMap[item.icon];
            const isProjectSpace = item.label === "Projects";
            const isLeadsClients = item.label === "Leads & Clients";
            const isActive = pathname.startsWith(item.href);

            if (isProjectSpace) {
              return null;
            }

            if (isLeadsClients) {
              return (
                <div key={item.label} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsLeadsClientsExpanded((current) => !current)}
                    className={cn(
                      sidebarButtonBaseClass,
                      isActive ? mainDashboardActiveClass : sidebarItemInactiveClass
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon strokeWidth={2.4} className={cn("h-4.5 w-4.5", isActive ? "text-[#F74917]" : "text-white/78 group-hover:text-white")} />
                      <span style={graphikRegularTextStyle}>{item.label}</span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isLeadsClientsOpen ? "rotate-180" : "rotate-0")} />
                  </button>

                  {isLeadsClientsOpen ? (
                    <div className="space-y-1.5 pl-4 pt-1">
                      {LEADS_CLIENTS_ITEMS.map((subItem) => {
                        const subActive = pathname.startsWith(subItem.href);

                        return (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            onClick={onNavigate}
                            className={cn(
                              sidebarSubItemBaseClass,
                              subActive ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                            )}
                          >
                            <span className="truncate" style={graphikRegularTextStyle}>{subItem.label}</span>
                          </Link>
                        );
                      })}
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
                  sidebarItemBaseClass,
                  isActive ? mainDashboardActiveClass : sidebarItemInactiveClass
                )}
              >
                <Icon strokeWidth={2.4} className={cn("h-4.5 w-4.5", isActive ? "text-[#F74917]" : "text-white/78 group-hover:text-white")} />
                <span style={graphikRegularTextStyle}>{item.label}</span>
              </Link>
            );
            })}
          </nav>

          {isLeadsClientsContext ? (
            <Link
              href="/app/dashboard"
              onClick={onNavigate}
              className={`${interMedium.className} mt-5 inline-flex h-10 w-auto items-center whitespace-nowrap rounded-[6px] bg-[#F74917] px-[14px] text-[14px] font-medium text-white transition-colors hover:bg-[#E63F10]`}
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5 shrink-0" />
              Back to Main Dashboard
            </Link>
          ) : null}
        </div>
      )}

      <div className="mt-auto pt-6">
        <div className="mb-4 h-px w-full bg-white/12" />
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[14px] px-5 py-4 text-left text-white/72 transition-colors hover:bg-white/10 hover:text-white"
                title={displayName}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F74917] text-[15px] font-semibold text-white">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`${interMedium.className} truncate text-[15px] font-semibold text-white`}>
                    {displayName}
                  </p>
                  <p className={`${interMedium.className} mt-0.5 text-[15px] text-white/58`}>Profile</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/58" strokeWidth={2.2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={12}
              className="w-52 rounded-[16px] border border-slate-200/80 bg-white p-2 shadow-[0_18px_48px_rgba(11,38,57,0.18)]"
            >
              <DropdownMenuItem className="h-11 rounded-[12px] px-3 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900">
                <Bell className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                <span style={graphikRegularTextStyle}>Notifications</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-11 rounded-[12px] px-0 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900">
                <Link href="/app/settings/organization" className="flex h-full w-full items-center px-3">
                  <Settings className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                  <span style={graphikRegularTextStyle}>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-11 rounded-[12px] px-0 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900">
                <Link href="/app/settings" className="flex h-full w-full items-center px-3">
                  <Clock3 className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                  <span style={graphikRegularTextStyle}>Time settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleLogout}
                className="h-11 rounded-[12px] px-3 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900"
              >
                <LogOut className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                <span style={graphikRegularTextStyle}>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-[268px] shrink-0 self-start flex-col overflow-hidden rounded-none bg-white shadow-none lg:flex",
        className
      )}
    >
      <SidebarNavContent />
    </aside>
  );
}
