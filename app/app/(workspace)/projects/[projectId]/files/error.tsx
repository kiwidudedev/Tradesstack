"use client";

import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";

export default function ProjectFilesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <OperationalAlert variant="error" role="alert">
      <span>Files could not be loaded. Refresh and try again.</span>
      <Button size="sm" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </OperationalAlert>
  );
}
