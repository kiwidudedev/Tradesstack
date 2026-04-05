import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

export default function IntegrationsPage() {
  return (
    <Card className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] shadow-none">
      <CardHeader className="pb-2 pt-7">
        <CardTitle className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#0F172A] sm:text-[32px]">
          Integrations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`${interMedium.className} text-sm font-medium text-[#5F7390]`}>
          Integrations section is ready for connected services and API controls.
        </p>
      </CardContent>
    </Card>
  );
}
