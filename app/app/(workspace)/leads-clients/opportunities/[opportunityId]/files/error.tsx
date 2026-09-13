"use client";

import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";

export default function OpportunityFilesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <OperationalAlert variant="error" role="alert" className="flex items-center justify-between gap-4">
      <span>Files could not be loaded. Refresh and try again.</span>
      <Button size="sm" variant="secondary" onClick={reset}>Retry</Button>
    </OperationalAlert>
  );
}
