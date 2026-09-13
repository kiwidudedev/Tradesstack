"use client";

export default function ProjectTakeoffError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reconciliationRequired = error.message.includes("Reconciliation is required");
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {reconciliationRequired ? "Takeoff reconciliation required" : "Takeoff could not be loaded"}
      </h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        {reconciliationRequired
          ? "Connected Takeoff data exists in both the legacy workspace and final Project. Nothing was merged or changed. Contact support to reconcile the authoritative graph."
          : "The Project Takeoff workspace could not be loaded safely."}
      </p>
      {!reconciliationRequired ? <button type="button" className="mt-4 text-sm font-semibold text-[var(--brand-blue)]" onClick={reset}>Try again</button> : null}
    </div>
  );
}

