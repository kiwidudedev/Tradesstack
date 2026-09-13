import type { ReactNode } from "react";

export function OpportunityQuoteRevisionStack({
  quote,
  history,
}: {
  quote: ReactNode;
  history?: ReactNode;
}) {
  return (
    <div className="space-y-6 px-5">
      <div className={history ? "pb-8" : undefined}>{quote}</div>
      {history}
    </div>
  );
}
