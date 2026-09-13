import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMember, hasPermission, rpc, redirect } = vi.hoisted(() => ({
  getMember: vi.fn(),
  hasPermission: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: getMember,
}));
vi.mock("@/lib/permissions-server", () => ({
  hasOrganizationPermission: hasPermission,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ rpc }),
}));

import { loadCompanyPaymentClaimsRegister } from "./company-register-server";
import type { CompanyPaymentClaimsFilters } from "./company-register-presentation";

const filters: CompanyPaymentClaimsFilters = {
  month: null,
  search: null,
  projectId: null,
  clientId: null,
  claimStatus: null,
  xeroStatus: null,
  externalStatus: null,
  paymentStatus: null,
  outstandingOnly: false,
  overdueOnly: false,
  attentionOnly: false,
  sort: "period",
  direction: "desc",
  page: 1,
};

const response = {
  rows: [],
  metrics: {
    amountPayable: 0,
    paid: 0,
    outstanding: 0,
    openClaims: 0,
    xeroAttention: 0,
  },
  pageInfo: { page: 1, pageSize: 50, totalRows: 0, totalPages: 1 },
  options: { projects: [], clients: [], months: [] },
  context: {
    month: "2026-07",
    timezone: "Pacific/Auckland",
    currency: "NZD",
    localToday: "2026-07-29",
  },
};

describe("company Payment Claims register server loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMember.mockResolvedValue({
      organization_id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-1",
    });
    hasPermission.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: response, error: null });
  });

  it("denies an organization member without the accounting permission before querying", async () => {
    hasPermission.mockResolvedValue(false);
    await expect(loadCompanyPaymentClaimsRegister(filters))
      .rejects.toThrow("redirect:/app/dashboard");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the current membership organization and performs exactly one RPC", async () => {
    await expect(loadCompanyPaymentClaimsRegister(filters)).resolves.toEqual(response);
    expect(hasPermission).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "accounting.sales_invoices.view",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "get_company_payment_claims_register",
      expect.objectContaining({
        p_organization_id: "11111111-1111-4111-8111-111111111111",
        p_page: 1,
        p_page_size: 50,
      }),
    );
  });
});
