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
    <Card className="relative overflow-hidden border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <CardHeader className="pb-3 pt-7">
        <CardTitle className="text-2xl font-semibold leading-none tracking-[-0.02em] text-[#0F172A]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {value ? <p className="font-heading text-6xl font-semibold tracking-[-0.03em] text-[#12141a]">{value}</p> : null}
        {status ? (
          <span className="inline-flex rounded-[6px] bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
            {status}
          </span>
        ) : null}
        <p className="text-[1.08rem] leading-relaxed text-[#4a5770]">{helper}</p>
        {rating ? (
          <div className="rounded-[6px] border border-[#d9deea] bg-white px-3 py-2.5">
            <div className="flex items-center gap-2 text-2xl font-semibold text-[#1e2430]">
              <Star className="h-4 w-4 fill-[var(--brand-orange)] text-[var(--brand-orange)]" />
              {rating}
            </div>
            <p className="mt-1 text-sm text-[#60718c]">{ratingText}</p>
          </div>
        ) : null}
        {caption ? <p className="text-sm text-[#8b98ac]">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}
