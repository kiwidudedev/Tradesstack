import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ibmPlexSans, interMedium } from "@/lib/fonts";

export default function FinancialSettingsPage() {
  return (
    <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className={`${ibmPlexSans.className} text-[22px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
          Company Cost Codes Moved
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`${interMedium.className} max-w-[560px] text-[15px] leading-[1.5] text-[#6A7A89]`}>
          Company Cost Code Setup now lives in the Company area so it sits alongside cost item
          review and the rest of your organization-level intelligence tools.
        </p>
        <div className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] px-4 py-4">
          <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
            New location
          </p>
          <p className={`${interMedium.className} mt-1 text-[14px] text-[#6A7A89]`}>
            Company &gt; Cost Codes
          </p>
        </div>
        <Button asChild className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]">
          <Link href="/app/company/cost-codes">Open Cost Codes</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
