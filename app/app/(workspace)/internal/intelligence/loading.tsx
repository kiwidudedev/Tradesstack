import { OperationalPanel } from "@/components/app/OperationalPanel";

export default function InternalIntelligenceLoading() {
  return (
    <section className="grid gap-4">
      <OperationalPanel title="Internal Intelligence Operations" description="Loading observability aggregates.">
        <div className="grid gap-3">
          <div className="h-24 animate-pulse rounded-[16px] bg-[var(--surface-muted)]" />
          <div className="h-64 animate-pulse rounded-[16px] bg-[var(--surface-muted)]" />
          <div className="h-64 animate-pulse rounded-[16px] bg-[var(--surface-muted)]" />
        </div>
      </OperationalPanel>
    </section>
  );
}
