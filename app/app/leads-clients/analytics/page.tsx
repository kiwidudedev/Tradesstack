import { AnalyticsDashboardClient } from "@/components/app/AnalyticsDashboardClient";
import { getLiveOpportunitiesForCurrentUser } from "@/lib/leads-clients-server";

export default async function LeadsClientsAnalyticsPage() {
  const rows = await getLiveOpportunitiesForCurrentUser();
  return <AnalyticsDashboardClient initialRows={rows} />;
}
