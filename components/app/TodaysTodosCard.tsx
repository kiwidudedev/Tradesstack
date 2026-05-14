import Link from "next/link";
import { Button } from "@/components/ui/button";
import { interMedium } from "@/lib/fonts";

export interface TodayFocusStats {
  tasksDueToday: number;
  pricingDeadlines: number;
  overdueItems: number;
  followUpsNeeded: number;
}

export function TodaysTodosCard({ stats }: { stats: TodayFocusStats }) {
  return (
    <section className="space-y-2">
      <h2 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>Today&apos;s Focus</h2>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span className={`${interMedium.className}`}>Tasks due: <span className="font-semibold text-[var(--text-primary)]">{stats.tasksDueToday}</span></span>
        <span className="text-[var(--text-muted)]">•</span>
        <span className={`${interMedium.className}`}>Overdue: <span className="font-semibold text-[var(--error)]">{stats.overdueItems}</span></span>
        <span className="text-[var(--text-muted)]">•</span>
        <span className={`${interMedium.className}`}>Pricing deadlines: <span className="font-semibold text-[var(--text-primary)]">{stats.pricingDeadlines}</span></span>
        <span className="text-[var(--text-muted)]">•</span>
        <span className={`${interMedium.className}`}>Follow-ups: <span className="font-semibold text-[var(--text-primary)]">{stats.followUpsNeeded}</span></span>
      </div>
      <div>
        <Button className="h-7 rounded-[7px] border border-[var(--success)] bg-[var(--success-light)] px-3 text-xs font-semibold text-[var(--success)] hover:bg-[var(--success-light)]" asChild>
          <Link href="/app/leads-clients/opportunities/new">Plan Today</Link>
        </Button>
      </div>
    </section>
  );
}
