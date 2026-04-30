import { interMedium } from "@/lib/fonts";
import { QUALITY_TABS } from "@/lib/quality-assurance/constants";
import type { QaTab } from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";

interface QualityTabsProps {
  activeTab: QaTab;
  onChange: (tab: QaTab) => void;
}

export function QualityTabs({ activeTab, onChange }: QualityTabsProps) {
  const getTabLabel = (tab: QaTab) => (tab === "Work Proof" ? "Work Log" : tab);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#E5EAF1] pb-3">
      {QUALITY_TABS.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={cn(
              `${interMedium.className} inline-flex h-10 items-center justify-center rounded-[12px] border px-5 text-[14px] font-semibold transition-colors`,
              isActive
                ? "border-[#0F172A] bg-[#0F172A] text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                : "border-[#D9E3EE] bg-white text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            )}
          >
            {getTabLabel(tab)}
          </button>
        );
      })}
    </div>
  );
}
