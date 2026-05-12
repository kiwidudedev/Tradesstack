import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

export default function IntegrationsPage() {
  return (
    <Card className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <CardHeader className="pb-4 pt-4">
        <CardTitle className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">
          Integrations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`${interMedium.className} text-sm font-medium text-[var(--text-secondary)]`}>
          Integrations section is ready for connected services and API controls.
        </p>
      </CardContent>
    </Card>
  );
}
