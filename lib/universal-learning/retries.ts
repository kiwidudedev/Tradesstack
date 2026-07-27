export function shouldRetryUniversalLearningRun(params: {
  attemptCount: number;
  maxAttempts: number;
}) {
  return params.attemptCount < params.maxAttempts;
}

export function getUniversalLearningRetryDelayMs(attemptCount: number) {
  return Math.min(30_000, 1_000 * Math.max(1, attemptCount) * 2);
}
