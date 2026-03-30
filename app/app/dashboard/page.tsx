import { redirect } from "next/navigation";
import { ClipboardList, FileSearch, Hammer, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getLiveOpportunitiesForCurrentUser } from "@/lib/leads-clients-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspacesForCurrentUser } from "@/lib/trade-pack-workspaces-server";

function toFirstName(value: string | null): string {
  if (!value) {
    return "User";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "User";
  }

  return trimmed.split(/\s+/)[0] ?? "User";
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long" }).format(value);
}

export default async function DashboardPage() {
  const [member, opportunities, projects] = await Promise.all([
    getCurrentOrganizationMember(),
    getLiveOpportunitiesForCurrentUser(),
    getTradePackWorkspacesForCurrentUser(),
  ]);

  if (!member) {
    redirect("/login");
  }

  if (projects.length === 0) {
    redirect("/app/projects/new");
  }

  const firstName = toFirstName(member.display_name ?? null);
  const dateLabel = formatLongDate(new Date());

  const requestsNew = opportunities.filter((row) => row.stage === "New").length;
  const requestsOverdue = opportunities.filter((row) => row.stage === "Reviewing").length;
  const quotesApproved = opportunities.filter((row) => row.stage === "Quoted").length;
  const quotesDraft = opportunities.filter((row) => row.stage === "Pricing").length;
  const jobsRequiresInvoicing = opportunities.filter((row) => row.stage === "Won").length;
  const jobsActive = projects.filter((row) => row.stage === "Construction").length;
  const invoicesAwaiting = opportunities.filter((row) => row.stage === "Quoted" || row.stage === "Won").length;
  const invoicesPastDue = opportunities.filter((row) => row.latestQuoteStatus === "Expired").length;

  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-4 pt-6">
          <p className={`${interMedium.className} text-base font-medium text-[#5F7390]`}>{dateLabel}</p>
          <CardTitle className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Good evening, {firstName}</CardTitle>
        </CardHeader>
      </Card>

      <Card className="relative overflow-hidden border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-6">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-[6px] border border-[#E6EAF0] bg-white">
            <div className="grid h-[4px] grid-cols-4">
              <div className="bg-[#B66A2F]" />
              <div className="bg-[#8E4157]" />
              <div className="bg-[#4C8B4A]" />
              <div className="bg-[#3F689D]" />
            </div>
            <div className="grid divide-y divide-[#E6EAF0] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              <div className="px-4 py-4">
                <p className={`${interMedium.className} flex items-center gap-2 text-sm font-semibold text-[#6F8097]`}>
                  <ClipboardList className="h-4 w-4 text-[#B66A2F]" />
                  Requests
                </p>
                <p className={`${interMedium.className} mt-2 text-4xl font-semibold leading-none text-[#0E2A43]`}>{requestsNew}</p>
                <p className={`${interMedium.className} mt-2 text-xl font-medium text-[#21354B]`}>New</p>
                <p className={`${interMedium.className} mt-2 text-sm text-[#3F556D]`}>Assessments complete ({requestsNew})</p>
                <p className={`${interMedium.className} mt-0.5 text-sm text-[#3F556D]`}>Overdue ({requestsOverdue})</p>
              </div>

              <div className="px-4 py-4">
                <p className={`${interMedium.className} flex items-center gap-2 text-sm font-semibold text-[#6F8097]`}>
                  <FileSearch className="h-4 w-4 text-[#8E4157]" />
                  Quotes
                </p>
                <p className={`${interMedium.className} mt-2 text-4xl font-semibold leading-none text-[#0E2A43]`}>{quotesApproved}</p>
                <p className={`${interMedium.className} mt-2 text-xl font-medium text-[#21354B]`}>Approved</p>
                <p className={`${interMedium.className} mt-2 text-sm text-[#3F556D]`}>Draft ({quotesDraft})</p>
                <p className={`${interMedium.className} mt-0.5 text-sm text-[#3F556D]`}>Changes requested (0)</p>
              </div>

              <div className="px-4 py-4">
                <p className={`${interMedium.className} flex items-center gap-2 text-sm font-semibold text-[#6F8097]`}>
                  <Hammer className="h-4 w-4 text-[#4C8B4A]" />
                  Jobs
                </p>
                <p className={`${interMedium.className} mt-2 text-4xl font-semibold leading-none text-[#0E2A43]`}>{jobsRequiresInvoicing}</p>
                <p className={`${interMedium.className} mt-2 text-xl font-medium text-[#21354B]`}>Requires invoicing</p>
                <p className={`${interMedium.className} mt-2 text-sm text-[#3F556D]`}>Active ({jobsActive})</p>
                <p className={`${interMedium.className} mt-0.5 text-sm text-[#3F556D]`}>Action required (0)</p>
              </div>

              <div className="px-4 py-4">
                <p className={`${interMedium.className} flex items-center gap-2 text-sm font-semibold text-[#6F8097]`}>
                  <ReceiptText className="h-4 w-4 text-[#3F689D]" />
                  Invoices
                </p>
                <p className={`${interMedium.className} mt-2 text-4xl font-semibold leading-none text-[#0E2A43]`}>{invoicesAwaiting}</p>
                <p className={`${interMedium.className} mt-2 text-xl font-medium text-[#21354B]`}>Awaiting payment</p>
                <p className={`${interMedium.className} mt-2 text-sm text-[#3F556D]`}>Draft (0)</p>
                <p className={`${interMedium.className} mt-0.5 text-sm text-[#3F556D]`}>Past due ({invoicesPastDue})</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
