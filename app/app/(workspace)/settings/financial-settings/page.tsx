import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ibmPlexSans, interMedium } from "@/lib/fonts";

export default function FinancialSettingsPage() {
  return (
    <Card className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-sm)]">
      <CardHeader className="pb-3">
        <CardTitle className={`${ibmPlexSans.className} text-[22px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]`}>
          Company Cost Codes Moved
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`${interMedium.className} max-w-[560px] text-[15px] leading-[1.5] text-[var(--text-secondary)]`}>
          Company Cost Code Setup now lives in the Company area so it sits alongside cost item
          review and the rest of your organization-level intelligence tools.
        </p>
        <div className="rounded-[var(--radius-md)] border border-[var(--app-border)] bg-[var(--surface-subtle)] px-4 py-4">
          <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[var(--text-primary)]`}>
            New location
          </p>
          <p className={`${interMedium.className} mt-1 text-[14px] text-[var(--text-secondary)]`}>
            Company &gt; Cost Codes
          </p>
        </div>
        <Button asChild>
          <Link href="/app/company/cost-codes">Open Cost Codes</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
