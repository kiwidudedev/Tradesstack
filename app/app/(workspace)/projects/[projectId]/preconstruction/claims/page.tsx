import { notFound } from "next/navigation";

import PaymentClaimsRegisterClient from "./PaymentClaimsRegisterClient";
import { RetentionWorkspaceBoundary } from "./RetentionWorkspaceBoundary";
import { RetentionWorkspaceSection } from "./RetentionWorkspaceSection";
import { loadFinancialsRegisterPageData } from "./financials-register-snapshots";

export default async function ProjectClaimsRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ retentionError?: string }>;
}) {
  const [{ projectId: projectSlug }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const registerData = await loadFinancialsRegisterPageData(projectSlug);
  if (!registerData) notFound();

  return (
    <>
      <PaymentClaimsRegisterClient
        initialSnapshot={registerData.payment.snapshot}
        initialError={registerData.payment.error}
      />
      <RetentionWorkspaceBoundary>
        <RetentionWorkspaceSection
          id="retention"
          projectSlug={projectSlug}
          retentionError={query.retentionError}
          initialSnapshot={registerData.retention.snapshot}
          initialError={registerData.retention.error}
        />
      </RetentionWorkspaceBoundary>
    </>
  );
}
