import { describe, expect, it, vi } from "vitest";
import { deleteSupplierInvoice } from "@/lib/supplier-invoice-delete-service";

const { remove, createAdminSupabaseClient } = vi.hoisted(() => {
  const removeMock = vi.fn();
  return {
    remove: removeMock,
    createAdminSupabaseClient: vi.fn(() => ({
      storage: {
        from: vi.fn(() => ({ remove: removeMock })),
      },
    })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("deleteSupplierInvoice", () => {
  it("returns a payment block for paid Xero bills", async () => {
    const result = await deleteSupplierInvoice({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "This Supplier Invoice cannot be deleted because a payment has been recorded against its Xero Bill." },
        }),
      } as never,
    });

    expect(result).toEqual({
      ok: false,
      code: "xero_payment",
      message: "This Supplier Invoice cannot be deleted because a payment has been recorded against its Xero Bill.",
    });
  });

  it("removes unique storage paths after a successful delete", async () => {
    remove.mockReset();
    remove.mockResolvedValue({ error: null });

    const result = await deleteSupplierInvoice({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            deletedInvoiceId: "invoice-1",
            storagePaths: ["path/a.pdf", "path/a.pdf", "path/b.pdf"],
          },
          error: null,
        }),
      } as never,
    });

    expect(remove).toHaveBeenCalledWith(["path/a.pdf", "path/b.pdf"]);
    expect(result).toEqual({
      ok: true,
      deletedInvoiceId: "invoice-1",
      storageCleanupWarnings: [],
    });
  });

  it("returns success when storage cleanup warns after DB deletion", async () => {
    remove.mockReset();
    remove.mockResolvedValue({ error: { message: "storage failed" } });

    const result = await deleteSupplierInvoice({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            deletedInvoiceId: "invoice-1",
            storagePaths: ["path/a.pdf"],
          },
          error: null,
        }),
      } as never,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storageCleanupWarnings).toHaveLength(1);
    }
  });
});
