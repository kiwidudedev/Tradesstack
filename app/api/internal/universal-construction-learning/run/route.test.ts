import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runUniversalConstructionLearningReview = vi.fn();
const applyUniversalLearningMemoryActions = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/universal-learning/runner", () => ({
  runUniversalConstructionLearningReview,
}));

vi.mock("@/lib/universal-learning/memory-actions", () => ({
  applyUniversalLearningMemoryActions,
}));

describe("POST /api/internal/universal-construction-learning/run", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    hasPlatformAdminRole.mockReset();
    runUniversalConstructionLearningReview.mockReset();
    applyUniversalLearningMemoryActions.mockReset();
  });

  it("rejects non-admin requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", { method: "POST" }));

    expect(response.status).toBe(403);
  });

  it("runs monthly reviews for the requested containers", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runUniversalConstructionLearningReview.mockResolvedValue({
      reviewRunId: "review-run-1",
      appliedCount: 2,
      skipped: false,
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        reviewMonth: "2026-06",
        containerTypes: ["supplier_invoice_allocation", "project_actual_cost_event"],
      }),
    }));

    const json = await response.json();

    expect(response.status).toBe(200);
    expect(runUniversalConstructionLearningReview).toHaveBeenCalledTimes(2);
    expect(runUniversalConstructionLearningReview.mock.calls[0][0].selection).toMatchObject({
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-06",
      runType: "monthly",
      scopeKey: "organization",
    });
    expect(json.results).toHaveLength(2);
    expect(json.results[0]).not.toHaveProperty("diagnostic");
  });

  it("runs a bounded Supplier Invoice diagnostic through the normal monthly runner", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runUniversalConstructionLearningReview.mockResolvedValue({
      reviewRunId: "review-run-diagnostic",
      appliedCount: 1,
      skipped: false,
      deferredRecordCount: 4,
      diagnostic: {
        schemaVersion: "supplier_bill.v2",
        sourceRecords: [{
          sourceId: "invoice-1",
          canonicalContentHash: "hash",
          canonicalBytes: 100,
          promptProjectedRecord: { sourceEvidence: { invoice: { sourceId: "invoice-1" } } },
        }],
        anthropicRequest: {
          model: "test-model",
          max_tokens: 100,
          temperature: 0,
          system: "system",
          messages: [{ role: "user", content: "prompt" }],
        },
        anthropicRawText: "{\"memoryActions\":[]}",
        normalizedResponse: { memoryActions: [] },
        memoryActions: [],
        tokenUsage: { inputTokens: 10, outputTokens: 2 },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-test",
        reviewMonth: "2026-07",
        containerTypes: ["supplier_invoice"],
        diagnostic: true,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(hasPlatformAdminRole).toHaveBeenCalledWith("admin");
    expect(runUniversalConstructionLearningReview).toHaveBeenCalledTimes(1);
    expect(runUniversalConstructionLearningReview).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({
        organizationId: "org-test",
        containerType: "supplier_invoice",
        reviewMonth: "2026-07",
        runType: "monthly",
      }),
      diagnostic: true,
      supplierBillRecordLimit: 3,
    }));
    expect(json.results[0].diagnostic).toEqual(expect.objectContaining({
      schemaVersion: "supplier_bill.v2",
      anthropicRawText: "{\"memoryActions\":[]}",
    }));
  });

  it.each([
    {
      name: "an omitted review month",
      body: {
        organizationId: "org-test",
        containerTypes: ["supplier_invoice"],
        diagnostic: true,
      },
    },
    {
      name: "multiple container types",
      body: {
        organizationId: "org-test",
        reviewMonth: "2026-07",
        containerTypes: ["supplier_invoice", "project_quote"],
        diagnostic: true,
      },
    },
    {
      name: "a non-Supplier-Invoice container",
      body: {
        organizationId: "org-test",
        reviewMonth: "2026-07",
        containerTypes: ["project_quote"],
        diagnostic: true,
      },
    },
  ])("rejects diagnostic mode with $name", async ({ body }) => {
    hasPlatformAdminRole.mockResolvedValue(true);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(400);
    expect(runUniversalConstructionLearningReview).not.toHaveBeenCalled();
  });

  it("requires an explicit organization allowlist for production diagnostics", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNIVERSAL_LEARNING_DIAGNOSTIC_ORGANIZATION_IDS", "org-allowed");
    hasPlatformAdminRole.mockResolvedValue(true);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-not-allowed",
        reviewMonth: "2026-07",
        containerTypes: ["supplier_invoice"],
        diagnostic: true,
      }),
    }));

    expect(response.status).toBe(403);
    expect(runUniversalConstructionLearningReview).not.toHaveBeenCalled();
  });

  it("requires organizationId", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewMonth: "2026-06",
      }),
    }));

    expect(response.status).toBe(400);
  });

  it("returns and logs the complete development error chain for a failed manual run", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    const postgresCause = Object.assign(new Error("duplicate review row"), {
      code: "23505",
      details: "Key already exists.",
      hint: "Inspect the review-run idempotency key.",
    });
    const anthropicError = Object.assign(new Error("Anthropic request failed"), {
      cause: postgresCause,
      status: 500,
      rawText: "provider response text",
      responsePayload: {
        type: "error",
        error: { type: "api_error", message: "Provider failed." },
      },
    });
    runUniversalConstructionLearningReview.mockRejectedValue(anthropicError);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const payload = {
      organizationId: "org-test",
      reviewMonth: "2026-07",
      containerTypes: ["supplier_invoice"],
      diagnostic: true,
    };

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({
      error: "Anthropic request failed",
      stack: expect.stringContaining("Anthropic request failed"),
      cause: "Error: duplicate review row",
      details: {
        error: {
          message: "Anthropic request failed",
          status: 500,
          rawText: "provider response text",
          responsePayload: {
            type: "error",
          },
          cause: {
            message: "duplicate review row",
            code: "23505",
          },
        },
        nestedCauses: [{
          message: "duplicate review row",
          code: "23505",
        }],
        codes: expect.arrayContaining(["status:500", "code:23505"]),
        requestPayload: payload,
      },
    });
    expect(errorLog).toHaveBeenCalledWith(
      "universal_learning_manual_run_request_payload",
      payload,
    );
    expect(errorLog).toHaveBeenCalledWith(
      "universal_learning_manual_run_complete_error",
      anthropicError,
    );
    expect(errorLog).toHaveBeenCalledWith(
      "universal_learning_manual_run_stack",
      expect.stringContaining("Anthropic request failed"),
    );
    expect(errorLog).toHaveBeenCalledWith(
      "universal_learning_manual_run_nested_causes",
      [postgresCause],
    );
    expect(errorLog).toHaveBeenCalledWith(
      "universal_learning_manual_run_database_or_provider_codes",
      expect.arrayContaining(["status:500", "code:23505"]),
    );
    expect(errorLog).toHaveBeenCalledWith(
      "universal_learning_manual_run_anthropic_error",
      anthropicError,
    );
    errorLog.mockRestore();
  });

  it("keeps production failures generic and does not emit temporary diagnostics", async () => {
    vi.stubEnv("NODE_ENV", "production");
    hasPlatformAdminRole.mockResolvedValue(true);
    runUniversalConstructionLearningReview.mockRejectedValue(
      Object.assign(new Error("Production failure"), {
        cause: new Error("private nested cause"),
        code: "private_code",
      }),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-allowed",
        reviewMonth: "2026-07",
        containerTypes: ["supplier_invoice"],
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Production failure" });
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
