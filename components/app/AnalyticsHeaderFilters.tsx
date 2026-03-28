"use client";

import { interMedium } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { BarChart3, Download } from "lucide-react";

type Props = {
  range: string;
  estimator: string;
  client: string;
  estimatorOptions: string[];
  clientOptions: string[];
  onRangeChange: (value: string) => void;
  onEstimatorChange: (value: string) => void;
  onClientChange: (value: string) => void;
  onExport: () => void;
};

export function AnalyticsHeaderFilters({
  range,
  estimator,
  client,
  estimatorOptions,
  clientOptions,
  onRangeChange,
  onEstimatorChange,
  onClientChange,
  onExport,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 rounded-[6px] border border-[#E8EDF4] bg-white px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#70839E]">
        <BarChart3 className="h-3.5 w-3.5 text-[#7F90A8]" />
        Analytics Filters
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select
          value={range}
          onChange={(event) => onRangeChange(event.target.value)}
          className={`${interMedium.className} h-10 rounded-[6px] border border-[#D8E2EE] bg-white px-3 text-sm font-medium text-[#24324A]`}
        >
          <option value="7d">Date: Last 7 days</option>
          <option value="30d">Date: Last 30 days</option>
          <option value="90d">Date: Last 90 days</option>
          <option value="all">Date: All time</option>
        </select>
        <select
          value={estimator}
          onChange={(event) => onEstimatorChange(event.target.value)}
          className={`${interMedium.className} h-10 rounded-[6px] border border-[#D8E2EE] bg-white px-3 text-sm font-medium text-[#24324A]`}
        >
          <option value="all">Estimator: All</option>
          {estimatorOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={client}
          onChange={(event) => onClientChange(event.target.value)}
          className={`${interMedium.className} h-10 rounded-[6px] border border-[#D8E2EE] bg-white px-3 text-sm font-medium text-[#24324A]`}
        >
          <option value="all">Client: All</option>
          {clientOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Button
          onClick={onExport}
          className="h-10 rounded-[6px] bg-[#082851] px-4 text-sm font-medium text-white hover:bg-[#0b3467]"
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>
    </div>
  );
}
