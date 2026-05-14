import { Star } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value?: string;
  helper: string;
  caption?: string;
  status?: string;
  rating?: string;
  ratingText?: string;
}

export function StatCard({ title, value, helper, caption, status, rating, ratingText }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <CardHeader className="pb-3 pt-7">
        <CardTitle className="text-2xl font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {value ? <p className="font-heading text-6xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{value}</p> : null}
        {status ? (
          <span className="inline-flex rounded-[var(--radius-sm)] bg-[var(--success-light)] px-3 py-1 text-sm font-semibold text-[var(--success)]">
            {status}
          </span>
        ) : null}
        <p className="text-[1.08rem] leading-relaxed text-[var(--text-secondary)]">{helper}</p>
        {rating ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <div className="flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)]">
              <Star className="h-4 w-4 fill-[var(--orange-primary)] text-[var(--orange-primary)]" />
              {rating}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{ratingText}</p>
          </div>
        ) : null}
        {caption ? <p className="text-sm text-[var(--text-muted)]">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}
