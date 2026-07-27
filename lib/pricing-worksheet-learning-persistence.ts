import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

export type PendingWorksheetLearningWrite = {
  clientMutationId: string;
  correctionEvents: Array<ReturnType<typeof import("@/lib/pricing-worksheet-intelligence").buildWorksheetCorrectionEventInput>>;
  enqueueOutbox: boolean;
  nextWorksheet: WorksheetData;
  occurredAt?: string;
  previousWorksheet: WorksheetData;
};

export function queuePendingWorksheetLearningWrite(
  queue: PendingWorksheetLearningWrite[],
  entry: PendingWorksheetLearningWrite,
) {
  const nextQueue = queue.filter((current) => current.clientMutationId !== entry.clientMutationId);
  nextQueue.push(entry);
  return nextQueue;
}

type FlushPendingWorksheetLearningWritesParams = {
  enqueueOutbox(input: {
    clientMutationId: string;
    nextWorksheet: WorksheetData;
    occurredAt?: string;
    previousWorksheet: WorksheetData;
  }): Promise<void>;
  queue: PendingWorksheetLearningWrite[];
  writeCorrectionEvent(input: ReturnType<typeof import("@/lib/pricing-worksheet-intelligence").buildWorksheetCorrectionEventInput>): Promise<void>;
  workbookId: string;
  sheetId: string;
  sheetName: string;
};

export async function flushPendingWorksheetLearningWrites(
  params: FlushPendingWorksheetLearningWritesParams,
) {
  const remainingQueue: PendingWorksheetLearningWrite[] = [];
  let flushedCount = 0;
  let outboxCount = 0;
  let correctionCount = 0;

  for (const entry of params.queue) {
    try {
      if (entry.enqueueOutbox) {
        await params.enqueueOutbox({
          clientMutationId: entry.clientMutationId,
          previousWorksheet: entry.previousWorksheet,
          nextWorksheet: entry.nextWorksheet,
          occurredAt: entry.occurredAt,
        });
        outboxCount += 1;
      }

      for (const event of entry.correctionEvents) {
        const nextEvent = {
          ...event,
          metadata: {
            ...(event.metadata ?? {}),
            workbookId: params.workbookId,
            sheetId: params.sheetId,
            sheetName: params.sheetName,
          },
        } satisfies ReturnType<typeof import("@/lib/pricing-worksheet-intelligence").buildWorksheetCorrectionEventInput>;
        await params.writeCorrectionEvent(nextEvent);
        correctionCount += 1;
      }

      flushedCount += 1;
    } catch {
      remainingQueue.push(entry);
    }
  }

  return {
    correctionCount,
    flushedCount,
    outboxCount,
    remainingQueue,
  };
}
