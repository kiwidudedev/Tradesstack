"use client";

import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";

export default function IntegrationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="space-y-5" aria-labelledby="integrations-error-title">
      <header className="space-y-2 pb-1 pt-1">
        <h2 id="integrations-error-title" className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-primary)]">Integrations</h2>
        <p className="text-sm text-[var(--text-secondary)]">Connect and manage the external services used by TradesStack.</p>
      </header>
      <OperationalPanel title="Unable to load integrations">
        <div role="alert" className="space-y-4">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">TradesStack could not load the integration settings safely. No connection state has been assumed.</p>
          <Button type="button" variant="secondary" onClick={reset}>Try again</Button>
        </div>
      </OperationalPanel>
    </section>
  );
}
