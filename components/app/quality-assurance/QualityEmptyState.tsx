import { interMedium } from "@/lib/fonts";

interface QualityEmptyStateProps {
  title: string;
  description: string;
}

export function QualityEmptyState({ title, description }: QualityEmptyStateProps) {
  return (
    <div className="rounded-[16px] border border-[#D9E3EE] bg-white px-4 py-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{title}</p>
      <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>{description}</p>
    </div>
  );
}
