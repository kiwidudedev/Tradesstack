import Link from "next/link";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getOrganizationProjectBySlugForCurrentUser,
  getProjectDashboardMetricsForCurrentUser,
} from "@/lib/projects-server";

const interMedium = Inter({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

interface ProjectModuleLink {
  label: string;
  segment: string;
  description: string;
}

const PROJECT_MODULE_LINKS: ProjectModuleLink[] = [
  {
    label: "Trade Pack Builder",
    segment: "drawing-intelligence",
    description: "Build focused trade drawing packs from full PDF sets.",
  },
  {
    label: "Scope Builder",
    segment: "scope-builder",
    description: "Convert drawing intelligence into structured scope outputs.",
  },
  {
    label: "Change Detection",
    segment: "change-detection",
    description: "Compare revisions and surface material drawing changes.",
  },
  {
    label: "AI Chatbot",
    segment: "ai-chatbot",
    description: "Query your project documentation with context-aware chat.",
  },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No activity yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatTradePackDisplayName(fileName: string | null): string {
  if (!fileName) {
    return "No generated trade pack yet";
  }

  const withoutExtension = fileName.replace(/\.pdf$/i, "").trim();

  // Prefer the readable title segment if the file follows "<prefix> - <title>".
  const dashParts = withoutExtension.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (dashParts.length > 1) {
    return dashParts[dashParts.length - 1];
  }

  return withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toRecentActivityItems(metrics: {
  latestGeneratedPackName: string | null;
  latestGeneratedPackUploadedAt: string | null;
  latestTradeLabel: string | null;
  latestClassifiedAt: string | null;
}) {
  const items = [];

  if (metrics.latestGeneratedPackUploadedAt) {
    items.push({
      id: "latest-trade-pack",
      title: "Trade Pack Generated",
      source: formatTradePackDisplayName(metrics.latestGeneratedPackName),
      time: formatDateTime(metrics.latestGeneratedPackUploadedAt),
    });
  }

  if (metrics.latestClassifiedAt) {
    items.push({
      id: "latest-scope-builder",
      title: "Scope Builder Run",
      source: metrics.latestTradeLabel ?? "Unspecified trade",
      time: formatDateTime(metrics.latestClassifiedAt),
    });
  }

  return items;
}

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getOrganizationProjectBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  const metrics = await getProjectDashboardMetricsForCurrentUser(project.id);
  const recentItems = toRecentActivityItems(metrics);

  return (
    <main className="space-y-8 pb-8">
      <section className="space-y-5">
        <h2 className={`${interMedium.className} text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>Project Snapshot</h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-[#E6EAF0] bg-white shadow-none">
            <CardContent className="p-5">
              <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.2em] text-[#8fa0ba]`}>Latest Trade Pack</p>
              <p className={`${interMedium.className} mt-2 text-base font-medium text-[#1d2433]`} title={metrics.latestGeneratedPackName ?? undefined}>
                {formatTradePackDisplayName(metrics.latestGeneratedPackName)}
              </p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#687996]`}>{formatDateTime(metrics.latestGeneratedPackUploadedAt)}</p>
            </CardContent>
          </Card>

          <Card className="border-[#E6EAF0] bg-white shadow-none">
            <CardContent className="p-5">
              <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.2em] text-[#8fa0ba]`}>Latest Scope Builder</p>
              <p className={`${interMedium.className} mt-2 text-base font-medium text-[#1d2433]`}>{metrics.latestTradeLabel ?? "No classification run yet"}</p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#687996]`}>{formatDateTime(metrics.latestClassifiedAt)}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className={`${interMedium.className} text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>Workspace Modules</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {PROJECT_MODULE_LINKS.map((module) => (
            <Link
              key={module.segment}
              href={`/app/projects/${project.slug}/${module.segment}`}
              className="group rounded-[12px] border border-[#E6EAF0] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]"
            >
              <p className={`${interMedium.className} text-base font-medium text-[#1d2433]`}>{module.label}</p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#687996]`}>{module.description}</p>
              <span className={`${interMedium.className} mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#53627d] transition-colors group-hover:text-[#ff5406]`}>
                Open
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className={`${interMedium.className} text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>Recent Activity</h2>
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="p-0">
            {recentItems.length > 0 ? (
              <ul className="divide-y divide-[#E6EAF0]">
                {recentItems.map((item) => (
                  <li key={item.id} className={`${interMedium.className} grid grid-cols-[auto_1fr_auto] items-start gap-4 px-5 py-4 text-sm`}>
                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#F74917]" />
                    <span>
                      <span className="block font-semibold text-[#0F172A]">{item.title}</span>
                      <span className="mt-1 block text-[#64748B]">{item.source}</span>
                    </span>
                    <span className="text-[#64748B]">{item.time}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={`${interMedium.className} px-5 py-4 text-sm font-medium text-[#64748B]`}>No recent activity yet.</div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
