// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LegacyMasterQuoteRedirectPage from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/quote/master/page";
const harness = vi.hoisted(() => ({
  session: { organizationId: "org-1" as string | null },
  router: { replace: vi.fn() },
  client: { rpc: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => harness.router }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ session: harness.session, isLoading: false }) }));
vi.mock("@/components/app/OpportunityWorkspaceDataProvider", () => ({
  useOpportunityWorkspaceData: () => ({ opportunityId: "opportunity-1", slug: "opportunity-slug" }),
}));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => harness.client }));
beforeEach(() => {
  vi.clearAllMocks();
  harness.session.organizationId = "org-1";
  harness.client.rpc.mockResolvedValue({ data: [{ revision_id: "quote-1" }], error: null });
});
afterEach(cleanup);
it("passes the guarded organization to the existing primary-quote RPC and redirects to its revision", async () => {
  render(<LegacyMasterQuoteRedirectPage />);
  await waitFor(() => expect(harness.router.replace).toHaveBeenCalledWith("/app/leads-clients/opportunities/opportunity-slug/quote/quote-1"));
  expect(harness.client.rpc).toHaveBeenCalledExactlyOnceWith("initialize_primary_opportunity_quote_v1", {
    p_organization_id: "org-1", p_opportunity_id: "opportunity-1",
  });
});
it("does not call the RPC until an organization is available", async () => {
  harness.session.organizationId = null;
  const view = render(<LegacyMasterQuoteRedirectPage />);
  expect(harness.client.rpc).not.toHaveBeenCalled();
  harness.session.organizationId = "org-1";
  view.rerender(<LegacyMasterQuoteRedirectPage />);
  await waitFor(() => expect(harness.router.replace).toHaveBeenCalledTimes(1));
});
