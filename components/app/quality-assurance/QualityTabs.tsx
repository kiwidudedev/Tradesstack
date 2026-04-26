import { Button } from "@/components/ui/button";
import { interMedium } from "@/lib/fonts";
import { QUALITY_TABS } from "@/lib/quality-assurance/constants";
import type { QaTab } from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";
import styles from "@/components/app/trade-pack-builder.module.css";

interface QualityTabsProps {
  activeTab: QaTab;
  onChange: (tab: QaTab) => void;
  onCreateIssue: () => void;
  onCreateInspection: () => void;
  onCreatePhoto: () => void;
  onCreateSignoff: () => void;
}

export function QualityTabs({
  activeTab,
  onChange,
  onCreateIssue,
  onCreateInspection,
  onCreatePhoto,
  onCreateSignoff,
}: QualityTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {QUALITY_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            `${interMedium.className} rounded-full px-4 py-2 text-[13px] font-semibold transition-colors`,
            activeTab === tab ? "bg-[#0B2739] text-white" : "border border-[#D7E1EC] bg-[#F8F9FC] text-[#475569] hover:bg-[#EEF2F7]"
          )}
        >
          {tab}
        </button>
      ))}
      <div className="ml-auto">
        {activeTab === "Issues" ? (
          <Button type="button" onClick={onCreateIssue} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
            Add Issue
          </Button>
        ) : null}
        {activeTab === "Inspections" ? (
          <Button type="button" onClick={onCreateInspection} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
            Add Inspection
          </Button>
        ) : null}
        {activeTab === "Photo Log" ? (
          <Button type="button" onClick={onCreatePhoto} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
            Upload Photo
          </Button>
        ) : null}
        {activeTab === "Sign-Offs" ? (
          <Button type="button" onClick={onCreateSignoff} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
            Add Sign-Off
          </Button>
        ) : null}
      </div>
    </div>
  );
}
