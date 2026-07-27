import "server-only";

export type RollingRetentionWorkerResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retired: true;
};

export async function runRollingRetentionWorker(
  _limit = 50,
): Promise<RollingRetentionWorkerResult> {
  void _limit;
  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retired: true,
  };
}
