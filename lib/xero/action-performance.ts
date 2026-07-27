import "server-only";

type XeroActionDomain = "payment_claim" | "retention_claim";

type XeroActionTimingIdentity = {
  domain: XeroActionDomain;
  action: "push" | "refresh" | "reset" | "panel_load";
  claimId: string;
  accountingDocumentId?: string | null;
  revisionId?: string | null;
  jobId?: string | null;
};

type XeroActionTimingEvent = XeroActionTimingIdentity & {
  event: "operation_complete" | "parallel_group_complete" | "complete" | "failed";
  stage: string;
  operationDurationMs: number;
  actionElapsedMs: number;
  batchDurationMs?: number;
  startedAt: number;
  completedAt: number;
  parentStage?: string;
  parallelGroup?: string;
  databaseOperation?: string;
  rowsReturned?: number;
  xeroRequestPurpose?: string;
  cacheStatus?: "hit" | "miss" | "not_applicable";
};

type TimingLogger = (event: XeroActionTimingEvent) => void;
type TimingDetail = Pick<
  XeroActionTimingEvent,
  | "databaseOperation"
  | "rowsReturned"
  | "xeroRequestPurpose"
  | "cacheStatus"
  | "parentStage"
  | "parallelGroup"
>;

const now = () => performance.now();

function defaultLogger(event: XeroActionTimingEvent) {
  console.info("[xero-action-performance]", event);
}

export function createXeroActionTiming(
  identity: XeroActionTimingIdentity,
  options?: {
    clock?: () => number;
    logger?: TimingLogger;
  },
) {
  const clock = options?.clock ?? now;
  const logger = options?.logger ?? defaultLogger;
  const actionStartedAt = clock();
  let currentIdentity = { ...identity };

  const emit = (params: {
    event: XeroActionTimingEvent["event"];
    stage: string;
    operationStartedAt: number;
    completedAt: number;
    batchDurationMs?: number;
    detail?: TimingDetail;
  }) => {
    logger({
      ...currentIdentity,
      event: params.event,
      stage: params.stage,
      operationDurationMs: Math.max(
        0,
        Math.round(params.completedAt - params.operationStartedAt),
      ),
      actionElapsedMs: Math.max(
        0,
        Math.round(params.completedAt - actionStartedAt),
      ),
      batchDurationMs: params.batchDurationMs,
      startedAt: params.operationStartedAt,
      completedAt: params.completedAt,
      ...params.detail,
    });
  };

  const startOperation = (
    stage: string,
    defaults?: TimingDetail,
  ) => {
    const operationStartedAt = clock();
    let completed = false;
    return {
      complete(detail?: TimingDetail) {
        if (completed) return;
        completed = true;
        const completedAt = clock();
        emit({
          event: "operation_complete",
          stage,
          operationStartedAt,
          completedAt,
          detail: { ...defaults, ...detail },
        });
      },
      fail(detail?: TimingDetail) {
        if (completed) return;
        completed = true;
        const completedAt = clock();
        emit({
          event: "failed",
          stage,
          operationStartedAt,
          completedAt,
          detail: { ...defaults, ...detail },
        });
      },
    };
  };

  const measure = async <T>(
    stage: string,
    operation: () => PromiseLike<T>,
    detail?: TimingDetail,
  ) => {
    const timer = startOperation(stage, detail);
    try {
      const result = await operation();
      timer.complete();
      return result;
    } catch (error) {
      timer.fail();
      throw error;
    }
  };

  return {
    startOperation,
    startParallelGroup(
      stage: string,
      detail?: Omit<TimingDetail, "parallelGroup">,
    ) {
      const groupStartedAt = clock();
      let completed = false;
      return {
        measure<T>(
          childStage: string,
          operation: () => PromiseLike<T>,
          childDetail?: TimingDetail,
        ) {
          return measure(childStage, operation, {
            ...childDetail,
            parentStage: childDetail?.parentStage ?? stage,
            parallelGroup: stage,
          });
        },
        complete(groupDetail?: Omit<TimingDetail, "parallelGroup">) {
          if (completed) return;
          completed = true;
          const completedAt = clock();
          const batchDurationMs = Math.max(
            0,
            Math.round(completedAt - groupStartedAt),
          );
          emit({
            event: "parallel_group_complete",
            stage,
            operationStartedAt: groupStartedAt,
            completedAt,
            batchDurationMs,
            detail: { ...detail, ...groupDetail },
          });
        },
      };
    },
    stage(stage: string, detail?: TimingDetail) {
      const at = clock();
      emit({
        event: "operation_complete",
        stage,
        operationStartedAt: at,
        completedAt: at,
        detail,
      });
    },
    complete() {
      const completedAt = clock();
      emit({
        event: "complete",
        stage: "action_complete",
        operationStartedAt: actionStartedAt,
        completedAt,
      });
    },
    failed(stage: string) {
      const at = clock();
      emit({
        event: "failed",
        stage,
        operationStartedAt: at,
        completedAt: at,
      });
    },
    identify(
      values: Pick<
        XeroActionTimingIdentity,
        "accountingDocumentId" | "revisionId" | "jobId"
      >,
    ) {
      currentIdentity = {
        ...currentIdentity,
        ...values,
      };
    },
    measure,
    // Compatibility alias. Both APIs now use exact operation-local timing.
    span: measure,
  };
}

export type XeroActionTiming = ReturnType<typeof createXeroActionTiming>;
