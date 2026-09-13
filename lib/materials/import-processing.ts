export type MaterialImportProcessingState = {
  status: "queued" | "processing" | "finalizing" | "ready" | "failed" | "cancelled";
  stage: "preparing" | "interpreting" | "finalizing" | null;
  completedChunks: number | null;
  totalChunks: number | null;
  attempt: number;
  errorCode: string | null;
};

type ProcessingRun = {
  status?: string | null;
  attempt?: number | null;
  chunk_manifest?: unknown;
  error_code?: string | null;
};

type ProcessingJob = {
  state?: string | null;
  attempt_count?: number | null;
  cancel_requested_at?: string | null;
  last_error_code?: string | null;
};

function chunkProgress(manifest: unknown) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { completedChunks: null, totalChunks: null };
  }
  const value = manifest as Record<string, unknown>;
  const totalChunks = typeof value.chunkCount === "number" ? value.chunkCount : null;
  const completedChunks = typeof value.completedChunks === "number" ? value.completedChunks : null;
  return { completedChunks, totalChunks };
}

export function deriveMaterialImportProcessing(input: {
  batchStatus: string;
  run?: ProcessingRun | null;
  job?: ProcessingJob | null;
}): MaterialImportProcessingState {
  const { completedChunks, totalChunks } = chunkProgress(input.run?.chunk_manifest);
  const attempt = input.job?.attempt_count ?? input.run?.attempt ?? 0;
  const errorCode = input.job?.last_error_code ?? input.run?.error_code ?? null;
  if (input.batchStatus === "ready_for_review" || input.batchStatus === "approved" || input.batchStatus === "partially_approved") {
    return { status: "ready", stage: null, completedChunks, totalChunks, attempt, errorCode: null };
  }
  if (input.batchStatus === "failed" || input.job?.state === "failed" || input.run?.status === "failed") {
    return { status: "failed", stage: null, completedChunks, totalChunks, attempt, errorCode };
  }
  if (input.batchStatus === "cancelled" || input.job?.state === "cancelled" || input.run?.status === "cancelled") {
    return { status: "cancelled", stage: null, completedChunks, totalChunks, attempt, errorCode };
  }
  if (input.job?.cancel_requested_at) {
    return { status: "processing", stage: "finalizing", completedChunks, totalChunks, attempt, errorCode };
  }
  if (input.job?.state === "processing") {
    return { status: "processing", stage: "interpreting", completedChunks, totalChunks, attempt, errorCode };
  }
  if (input.job?.state === "completed" || input.run?.status === "completed" || input.run?.status === "partial") {
    return { status: "finalizing", stage: "finalizing", completedChunks, totalChunks, attempt, errorCode };
  }
  return { status: "queued", stage: "preparing", completedChunks, totalChunks, attempt, errorCode };
}

export function materialImportFailureCopy(errorCode: string | null) {
  if (errorCode === "provider_timeout") {
    return {
      title: "We couldn't finish interpreting this price list.",
      description: "The document took longer than the bounded processing window. Try again when you're ready.",
    };
  }
  if (errorCode === "provider_billing_error") {
    return {
      title: "Supplier price interpretation is unavailable.",
      description: "Anthropic billing must be restored by an administrator before this document can be processed.",
    };
  }
  if (errorCode === "provider_max_tokens" || errorCode === "provider_schema_parse_failed") {
    return {
      title: "We couldn't prepare this price list for review.",
      description: "The provider response could not be safely converted into supplier pricing rows. Try again to start one new attempt.",
    };
  }
  return {
    title: "We couldn't interpret this price list.",
    description: "No review rows were created. Try again to start one new interpretation attempt.",
  };
}
