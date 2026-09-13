import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { runMaterialSupplierPricingWorker } from "@/lib/materials/import-job-service";

export type MaterialImportWorkerKickContext = {
  batchId: string;
  jobId: string;
  trigger: "create" | "reprocess";
};

export type MaterialImportPostResponseScheduler = (task: () => Promise<unknown>) => void;

function safeKickMessage() {
  return "Unable to start the Material import worker.";
}

export async function kickMaterialSupplierPricingWorker(
  context: MaterialImportWorkerKickContext,
  worker: typeof runMaterialSupplierPricingWorker = runMaterialSupplierPricingWorker,
) {
  if (!isBackgroundJobEnabled("material-supplier-pricing")) return { started: false, disabled: true } as const;
  try {
    console.info("material_import_worker_kick_started", context);
    // A request wakes only its own durable job; cron handles the bounded backlog.
    const result = await worker(`material-${context.trigger}-${context.jobId}-1-1`, context.jobId);
    const results = result.claimed ? [result] : [];
    const targetResult = results.find((result) => result.jobId === context.jobId);
    console.info("material_import_worker_kick_completed", {
      ...context,
      jobsProcessed: results.length,
      targetClaimed: Boolean(targetResult),
      targetStatus: targetResult?.status ?? null,
    });
    return {
      started: results.length > 0,
      targetClaimed: Boolean(targetResult),
      targetResult: targetResult ?? null,
      results,
    } as const;
  } catch (error) {
    console.warn("material_import_worker_kick_failed", {
      batchId: context.batchId,
      jobId: context.jobId,
      trigger: context.trigger,
      errorCode: "worker_kick_failed",
      message: safeKickMessage(),
    });
    return { started: false, recoverable: true, errorCode: "worker_kick_failed" } as const;
  }
}

export function scheduleMaterialSupplierPricingWorker(
  scheduler: MaterialImportPostResponseScheduler,
  context: MaterialImportWorkerKickContext,
) {
  if (!isBackgroundJobEnabled("material-supplier-pricing")) return { scheduled: false, disabled: true } as const;
  try {
    scheduler(async () => {
      console.info("material_import_worker_after_entered", context);
      await kickMaterialSupplierPricingWorker(context);
    });
    console.info("material_import_worker_kick_scheduled", context);
    return { scheduled: true } as const;
  } catch (error) {
    console.warn("material_import_worker_schedule_failed", {
      batchId: context.batchId,
      jobId: context.jobId,
      trigger: context.trigger,
      errorCode: "worker_schedule_failed",
      message: safeKickMessage(),
    });
    return { scheduled: false, recoverable: true, errorCode: "worker_schedule_failed" } as const;
  }
}
