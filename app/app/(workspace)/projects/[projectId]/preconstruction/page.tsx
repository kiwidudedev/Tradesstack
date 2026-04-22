import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

export default function PreconstructionPage() {
  return (
    <Card className="relative overflow-hidden border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <CardHeader className="pt-7">
        <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Financial</CardTitle>
      </CardHeader>
      <CardContent className="pb-7">
        <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>
          Open financial workflows for this project.
        </p>
        <div className="mt-4 rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] p-4">
          <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.14em] text-[#64748B]`}>Navigation</p>
          <Link
            href="quote"
            className={`${interMedium.className} mt-3 inline-flex h-10 items-center rounded-[6px] border border-[#D6DDE9] bg-[#F8F9FC] px-4 text-sm font-medium text-[#1D2433] hover:bg-[#F1F5F9]`}
          >
            Quote
          </Link>
          <Link
            href="variations"
            className={`${interMedium.className} mt-3 inline-flex h-10 items-center rounded-[6px] border border-[#D6DDE9] bg-[#F8F9FC] px-4 text-sm font-medium text-[#1D2433] hover:bg-[#F1F5F9]`}
          >
            Variations
          </Link>
          <Link
            href="purchase-orders"
            className={`${interMedium.className} mt-3 inline-flex h-10 items-center rounded-[6px] border border-[#D6DDE9] bg-[#F8F9FC] px-4 text-sm font-medium text-[#1D2433] hover:bg-[#F1F5F9]`}
          >
            Purchase Orders
          </Link>
          <Link
            href="claims"
            className={`${interMedium.className} mt-3 inline-flex h-10 items-center rounded-[6px] border border-[#D6DDE9] bg-[#F8F9FC] px-4 text-sm font-medium text-[#1D2433] hover:bg-[#F1F5F9]`}
          >
            Claims
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
