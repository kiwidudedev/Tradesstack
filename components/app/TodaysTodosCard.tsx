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
      <h2 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.08em] text-[#5E718A]`}>Today&apos;s Focus</h2>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#435872]">
        <span className={`${interMedium.className}`}>Tasks due: <span className="font-semibold text-[#0F172A]">{stats.tasksDueToday}</span></span>
        <span className="text-[#A1AEC0]">•</span>
        <span className={`${interMedium.className}`}>Overdue: <span className="font-semibold text-[#B91C1C]">{stats.overdueItems}</span></span>
        <span className="text-[#A1AEC0]">•</span>
        <span className={`${interMedium.className}`}>Pricing deadlines: <span className="font-semibold text-[#0F172A]">{stats.pricingDeadlines}</span></span>
        <span className="text-[#A1AEC0]">•</span>
        <span className={`${interMedium.className}`}>Follow-ups: <span className="font-semibold text-[#0F172A]">{stats.followUpsNeeded}</span></span>
      </div>
      <div>
        <Button className="h-7 rounded-[7px] border border-[#9DC58A] bg-[#F4FBF0] px-3 text-xs font-semibold text-[#4A7D37] hover:bg-[#E9F7E2]" asChild>
          <Link href="/app/leads-clients/opportunities/new">Plan Today</Link>
        </Button>
      </div>
    </section>
  );
}
