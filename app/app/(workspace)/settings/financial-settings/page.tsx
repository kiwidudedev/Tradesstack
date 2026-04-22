import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

export default function FinancialSettingsPage() {
  return (
    <Card className="rounded-[22px] border border-[#D9DEE5] bg-white shadow-none">
      <CardHeader className="pb-4 pt-4">
        <CardTitle className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">
          Financial Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`${interMedium.className} text-sm font-medium text-[#5F7390]`}>
          Financial settings section is ready for configuration controls.
        </p>
      </CardContent>
    </Card>
  );
}
