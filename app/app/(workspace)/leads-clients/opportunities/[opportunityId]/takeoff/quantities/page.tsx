import { OpportunityWorkspaceShell } from "@/components/app/OpportunityWorkspaceShell";
import type { TakeoffPageSearchParams } from "../takeoff-page-data";
import { getTakeoffPageShellData } from "../takeoff-page-data";

export default async function OpportunityTakeoffQuantitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const [{ opportunityId }, query] = await Promise.all([params, searchParams]);
  const { headerTitle } = await getTakeoffPageShellData(opportunityId);

  void query;

  return (
    <OpportunityWorkspaceShell title={headerTitle} opportunityId={opportunityId} activeTab="takeoff">
      <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-6 text-[15px] font-medium text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        Quantities page placeholder
      </div>
    </OpportunityWorkspaceShell>
  );
}
