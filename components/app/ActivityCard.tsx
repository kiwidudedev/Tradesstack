import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import type { RecentActivityItem } from "@/lib/projects-server";

function parseActivityLabel(label: string) {
  const [eventLabel, sourceLabel] = label.split(" - ");
  return {
    eventLabel: eventLabel ?? label,
    sourceLabel: sourceLabel ?? "Trade Pack Workspace",
  };
}

function formatOccurredAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes}m ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours}h ago`;
  }

  const days = Math.floor(diffMs / dayMs);
  if (days === 1) {
    return "Yesterday";
  }

  if (days < 30) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
}

export function ActivityCard({ items }: { items: RecentActivityItem[] }) {
  return (
    <Card className="relative overflow-hidden rounded-none border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-5 pt-0">
        <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="rounded-[12px] border border-[#E6EAF0] bg-white p-0">
        {items.length > 0 ? (
          <ul className="divide-y divide-[#E6EAF0]">
            {items.map((item) => {
              const { eventLabel, sourceLabel } = parseActivityLabel(item.label);

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`${interMedium.className} grid grid-cols-[auto_1fr_auto] items-start gap-4 px-5 py-4 text-sm transition-colors hover:bg-[#F8FAFC]`}
                  >
                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#F74917]" />
                    <span>
                      <span className="block font-semibold text-[#0F172A]">{eventLabel}</span>
                      <span className="mt-1 block text-[#64748B]">{sourceLabel}</span>
                    </span>
                    <span className="text-[#64748B]">{formatOccurredAt(item.occurredAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={`${interMedium.className} rounded-[12px] px-5 py-4 text-sm font-medium text-[#64748B]`}>
            No recent activity yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
