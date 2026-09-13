import { Loader2 } from "lucide-react";

export default function ProjectQuoteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex items-center gap-2 py-5 text-[13px] text-[var(--text-secondary)]"
    >
      <Loader2
        aria-hidden="true"
        className="h-4 w-4 animate-spin text-[var(--brand-blue)]"
      />
      <span>Loading quote…</span>
    </div>
  );
}
