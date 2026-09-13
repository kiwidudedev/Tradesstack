import { OperationalPanel } from "@/components/app/OperationalPanel";

export default function IntegrationsLoading() {
  return (
    <section className="space-y-5" aria-label="Loading integrations" aria-busy="true">
      <header className="space-y-2 pb-1 pt-1">
        <h2 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-primary)]">Integrations</h2>
        <p className="text-sm text-[var(--text-secondary)]">Loading connection details...</p>
      </header>
      <OperationalPanel>
        <div className="space-y-4">
          <div className="h-11 w-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-muted)]" />
          <div className="h-4 w-full max-w-[420px] animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="h-4 w-full max-w-[320px] animate-pulse rounded bg-[var(--surface-muted)]" />
        </div>
      </OperationalPanel>
    </section>
  );
}
