import { interMedium } from "@/lib/fonts";

interface QualityEmptyStateProps {
  title: string;
  description: string;
}

export function QualityEmptyState({ title, description }: QualityEmptyStateProps) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-7 text-center">
      <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{title}</p>
      <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>{description}</p>
    </div>
  );
}
