import { interMedium } from "@/lib/fonts";

interface QualityEmptyStateProps {
  title: string;
  description: string;
}

export function QualityEmptyState({ title, description }: QualityEmptyStateProps) {
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <p className={`${interMedium.className} text-sm font-semibold text-[var(--text-primary)]`}>{title}</p>
      <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>{description}</p>
    </div>
  );
}
