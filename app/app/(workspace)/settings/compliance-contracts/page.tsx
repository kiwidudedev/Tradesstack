import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

export default function ComplianceContractsPage() {
  return (
    <Card className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <CardHeader className="pb-4 pt-4">
        <CardTitle className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">
          Compliance & Contracts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`${interMedium.className} text-sm font-medium text-[var(--text-secondary)]`}>
          Compliance and contracts section is ready for policy and legal defaults.
        </p>
      </CardContent>
    </Card>
  );
}
