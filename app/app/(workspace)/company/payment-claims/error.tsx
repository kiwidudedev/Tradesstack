"use client";

import { AlertTriangle } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";

export default function CompanyPaymentClaimsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <OperationalPanel>
      <OperationalEmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Payment Claims could not be loaded."
        description="Try loading the register again. No accounting synchronization was started."
        actions={<Button onClick={reset}>Try again</Button>}
      />
    </OperationalPanel>
  );
}

