import { OperationalPanel } from "@/components/app/OperationalPanel";

export default function CompanyMemoryInspectionLoading() {
  return (
    <main className="space-y-6 bg-[var(--background)] pb-8">
      <OperationalPanel
        title="Memory Inspection & Explainability"
        description="Loading organization memory explorer."
      >
        <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr),320px]">
          <div className="h-[720px] animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
          <div className="space-y-6">
            <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
            <div className="h-96 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
          </div>
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
            <div className="h-72 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
          </div>
        </div>
      </OperationalPanel>
    </main>
  );
}
