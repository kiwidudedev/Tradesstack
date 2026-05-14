import { ibmPlexSans, interMedium } from "@/lib/fonts";

function SkeletonBlock({
  className,
}: {
  className: string;
}) {
  return <div className={`animate-pulse rounded-[14px] bg-[var(--surface-muted)] ${className}`} />;
}

function ProjectFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme -mx-[0.384rem] bg-[var(--background)] pb-8 sm:-mx-[1.024rem]`}>
      <div className="space-y-6 bg-[var(--background)]">
        <div className="bg-[var(--surface)] shadow-none">
          <div className="flex flex-col gap-3 bg-[var(--surface)] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <SkeletonBlock className="h-8 w-64 max-w-full" />
              <SkeletonBlock className="h-4 w-36" />
            </div>
            <SkeletonBlock className="h-10 w-40" />
          </div>

          <div className="sticky top-14 z-20 border-b-2 bg-[var(--surface)] px-5" style={{ borderBottomColor: "var(--border)" }}>
            <div className="flex min-w-max items-center gap-8 py-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-6 w-24 rounded-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 bg-[var(--background)] px-5">{children}</div>
      </div>
    </div>
  );
}

export function ProjectWorkspaceLoadingSkeleton() {
  return (
    <ProjectFrame>
      <div className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-10 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              <SkeletonBlock className="h-12 w-12 rounded-[16px]" />
              <SkeletonBlock className="mt-6 h-8 w-24" />
              <SkeletonBlock className="mt-4 h-4 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </ProjectFrame>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <ProjectFrame>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-4">
                <SkeletonBlock className="h-[3.1rem] w-[3.1rem] rounded-[1rem]" />
                <SkeletonBlock className="h-5 w-28" />
              </div>
              <SkeletonBlock className="mt-10 h-10 w-24" />
              <SkeletonBlock className="mt-4 h-4 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)]">
          <SkeletonCard lines={7} />
          <SkeletonCard lines={5} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </ProjectFrame>
  );
}

export function BoardLoadingSkeleton({
  title,
  metricCount = 3,
  showFilters = true,
  tableRows = 5,
}: {
  title: string;
  metricCount?: number;
  showFilters?: boolean;
  tableRows?: number;
}) {
  return (
    <ProjectFrame>
      <div className="space-y-6 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <h1 className="m-0 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]">{title}</h1>
            <div className="flex flex-wrap items-center gap-3">
              {Array.from({ length: metricCount }).map((_, index) => (
                <SkeletonBlock key={index} className="h-10 w-36 rounded-[12px]" />
              ))}
            </div>
          </div>
          <SkeletonBlock className="h-9 w-32 rounded-[12px]" />
        </div>

        {showFilters ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-10 w-[150px] rounded-[12px]" />
            ))}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
            <SkeletonBlock className="h-4 w-48 rounded-full" />
          </div>
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: tableRows }).map((_, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-4">
                <SkeletonBlock className="h-5 w-full" />
                <SkeletonBlock className="h-5 w-full" />
                <SkeletonBlock className="h-5 w-full" />
                <SkeletonBlock className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ProjectFrame>
  );
}

export function DashboardSectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <SkeletonBlock className="h-5 w-28" />
            <SkeletonBlock className="mt-8 h-10 w-24" />
            <SkeletonBlock className="mt-4 h-4 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}

export function DashboardActivitySkeleton() {
  return <SkeletonCard lines={4} />;
}

export function TodosSectionSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-10 w-full rounded-[12px]" />
      <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
          <SkeletonBlock className="h-4 w-40" />
        </div>
        <div className="space-y-4 px-5 py-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-[1.3fr_1.4fr_0.8fr_0.8fr]">
              <SkeletonBlock className="h-5 w-full" />
              <SkeletonBlock className="h-5 w-full" />
              <SkeletonBlock className="h-5 w-24" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QualitySectionSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="mt-8 h-10 w-20" />
            <SkeletonBlock className="mt-4 h-4 w-28" />
          </div>
        ))}
      </div>
      <SkeletonCard lines={6} />
    </div>
  );
}

function SkeletonCard({
  lines = 4,
}: {
  lines?: number;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <SkeletonBlock className="h-6 w-40" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock
            key={index}
            className={`h-4 ${index === lines - 1 ? "w-1/2" : "w-full"}`}
          />
        ))}
      </div>
      <p className={`${interMedium.className} mt-4 text-xs text-[var(--text-muted)]`}>Loading project workspace…</p>
    </div>
  );
}
