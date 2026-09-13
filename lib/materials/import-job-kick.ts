import { runMaterialSupplierPricingWorker } from "@/lib/materials/import-job-service";

export type MaterialImportWorkerKickContext = {
  batchId: string;
  jobId: string;
  trigger: "create" | "reprocess";
};

export type MaterialImportPostResponseScheduler = (task: () => Promise<unknown>) => void;

const IMMEDIATE_WORKER_CONCURRENCY = 4;

function safeKickMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Unable to start the Material import worker.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

export async function kickMaterialSupplierPricingWorker(
  context: MaterialImportWorkerKickContext,
  worker: typeof runMaterialSupplierPricingWorker = runMaterialSupplierPricingWorker,
) {
  try {
    console.info("material_import_worker_kick_started", context);
    const results = (await Promise.all(Array.from(
      { length: IMMEDIATE_WORKER_CONCURRENCY },
      async (_, lane) => {
        const laneResults = [];
        while (true) {
          const result = await worker(
            `material-${context.trigger}-${context.jobId}-${lane + 1}-${laneResults.length + 1}`,
          );
          if (!result.claimed) break;
          laneResults.push(result);
        }
        return laneResults;
      },
    ))).flat();
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
      message: safeKickMessage(error),
    });
    return { started: false, recoverable: true, errorCode: "worker_kick_failed" } as const;
  }
}

export function scheduleMaterialSupplierPricingWorker(
  scheduler: MaterialImportPostResponseScheduler,
  context: MaterialImportWorkerKickContext,
) {
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
      message: safeKickMessage(error),
    });
    return { scheduled: false, recoverable: true, errorCode: "worker_schedule_failed" } as const;
  }
}
