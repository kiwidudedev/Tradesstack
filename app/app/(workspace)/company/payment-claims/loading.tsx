import { OperationalPanel } from "@/components/app/OperationalPanel";

export default function CompanyPaymentClaimsLoading() {
  return (
    <main className="space-y-6" aria-busy="true" aria-label="Loading Payment Claims">
      <div className="h-5 w-48 animate-pulse rounded bg-[var(--surface-muted)]" />
      <div className="space-y-3">
        <div className="h-7 w-56 animate-pulse rounded bg-[var(--surface-muted)]" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded bg-[var(--surface-muted)]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
        ))}
      </div>
      <OperationalPanel contentClassName="space-y-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-12 animate-pulse rounded bg-[var(--surface-muted)]" />
        ))}
      </OperationalPanel>
    </main>
  );
}

