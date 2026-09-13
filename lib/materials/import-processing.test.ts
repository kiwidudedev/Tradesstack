import { describe, expect, it } from "vitest";
import { deriveMaterialImportProcessing, materialImportFailureCopy } from "@/lib/materials/import-processing";

describe("Material import processing presentation", () => {
  it("maps durable queue states without exposing lease internals", () => {
    expect(deriveMaterialImportProcessing({ batchStatus: "extracting", job: { state: "queued", attempt_count: 0 } }))
      .toEqual({ status: "queued", stage: "preparing", completedChunks: null, totalChunks: null, attempt: 0, errorCode: null });
    expect(deriveMaterialImportProcessing({ batchStatus: "extracting", job: { state: "processing", attempt_count: 1 } }))
      .toMatchObject({ status: "processing", stage: "interpreting", attempt: 1 });
    expect(deriveMaterialImportProcessing({ batchStatus: "extracting", job: { state: "completed" }, run: { status: "completed" } }))
      .toMatchObject({ status: "finalizing", stage: "finalizing" });
    expect(deriveMaterialImportProcessing({ batchStatus: "ready_for_review" }))
      .toMatchObject({ status: "ready", stage: null });
    expect(deriveMaterialImportProcessing({ batchStatus: "cancelled", job: { state: "cancelled", attempt_count: 1 } }))
      .toMatchObject({ status: "cancelled", stage: null, attempt: 1 });
    expect(deriveMaterialImportProcessing({
      batchStatus: "extracting",
      job: { state: "processing", attempt_count: 1 },
      run: { status: "processing", chunk_manifest: { chunkCount: 4, completedChunks: 2 } },
    })).toMatchObject({ status: "processing", stage: "interpreting", totalChunks: 4, completedChunks: 2 });
  });

  it("makes timeout and billing failures terminal and actionable", () => {
    expect(deriveMaterialImportProcessing({
      batchStatus: "failed",
      job: { state: "failed", attempt_count: 1, last_error_code: "provider_timeout" },
    })).toMatchObject({ status: "failed", stage: null, attempt: 1, errorCode: "provider_timeout" });
    expect(materialImportFailureCopy("provider_timeout").description).toContain("bounded processing window");
    expect(materialImportFailureCopy("provider_billing_error").description).toContain("administrator");
  });
});
