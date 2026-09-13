import { OperationalBreadcrumbs } from "@/components/app/OperationalBreadcrumbs";
import { loadCompanyPaymentClaimsRegister } from "@/lib/payment-claims/company-register-server";
import { parseCompanyPaymentClaimsFilters } from "@/lib/payment-claims/company-register-presentation";
import { CompanyPaymentClaimsWorkspace } from "./CompanyPaymentClaimsWorkspace";
import type { CompanyPaymentClaimsSearchParams } from "./payment-claim-register-types";

export default async function CompanyPaymentClaimsPage({
  searchParams,
}: {
  searchParams: Promise<CompanyPaymentClaimsSearchParams>;
}) {
  const params = await searchParams;
  const filters = parseCompanyPaymentClaimsFilters(params);
  const register = await loadCompanyPaymentClaimsRegister(filters);

  return (
    <div className="space-y-5">
      <OperationalBreadcrumbs
        items={[
          { label: "Company" },
          { label: "Payment Claims" },
        ]}
      />
      <CompanyPaymentClaimsWorkspace
        register={register}
        filters={filters}
      />
    </div>
  );
}

