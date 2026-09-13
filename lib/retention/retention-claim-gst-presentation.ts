export type RetentionClaimGstBreakdown = {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxType: string;
  effectiveRate: number;
};

type RetentionClaimProviderPayment = {
  paidMinor: number;
  outstandingMinor: number;
};

function validBreakdown(
  value: RetentionClaimGstBreakdown | null,
): RetentionClaimGstBreakdown | null {
  if (
    !value
    || !Number.isSafeInteger(value.subtotalMinor)
    || !Number.isSafeInteger(value.taxMinor)
    || !Number.isSafeInteger(value.totalMinor)
    || value.subtotalMinor < 0
    || value.taxMinor < 0
    || value.totalMinor !== value.subtotalMinor + value.taxMinor
    || !value.taxType.trim()
    || !Number.isFinite(value.effectiveRate)
    || value.effectiveRate < 0
  ) {
    return null;
  }
  return value;
}

function validPayment(
  value: RetentionClaimProviderPayment | null,
): RetentionClaimProviderPayment | null {
  if (
    !value
    || !Number.isSafeInteger(value.paidMinor)
    || !Number.isSafeInteger(value.outstandingMinor)
    || value.paidMinor < 0
    || value.outstandingMinor < 0
  ) {
    return null;
  }
  return value;
}

export function resolveRetentionClaimGstPresentation(params: {
  currentEvidence: RetentionClaimGstBreakdown | null;
  pushedEvidence: RetentionClaimGstBreakdown | null;
  hasPushedRevision: boolean;
  providerPayment: RetentionClaimProviderPayment | null;
}) {
  const current = validBreakdown(params.currentEvidence);
  const pushed = validBreakdown(params.pushedEvidence);
  if (!current) {
    return {
      current: null,
      pushed: null,
      newSincePush: null,
      payment: validPayment(params.providerPayment),
    };
  }
  const effectivePushed = pushed ?? (!params.hasPushedRevision
    ? {
        ...current,
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
      }
    : null);
  const newSincePush = effectivePushed
    && effectivePushed.taxType === current.taxType
    && effectivePushed.effectiveRate === current.effectiveRate
    && effectivePushed.subtotalMinor <= current.subtotalMinor
    && effectivePushed.taxMinor <= current.taxMinor
    && effectivePushed.totalMinor <= current.totalMinor
    ? {
        subtotalMinor: current.subtotalMinor - effectivePushed.subtotalMinor,
        taxMinor: current.taxMinor - effectivePushed.taxMinor,
        totalMinor: current.totalMinor - effectivePushed.totalMinor,
        taxType: current.taxType,
        effectiveRate: current.effectiveRate,
      }
    : null;
  return {
    current,
    pushed: effectivePushed,
    newSincePush,
    payment: validPayment(params.providerPayment),
  };
}
