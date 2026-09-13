import { describe, expect, it } from "vitest";
import {
  resolveRetentionClaimGstPresentation,
} from "./retention-claim-gst-presentation";

const output2 = {
  subtotalMinor: 100_000,
  taxMinor: 15_000,
  totalMinor: 115_000,
  taxType: "OUTPUT2",
  effectiveRate: 15,
};

describe("Retention Claim GST presentation", () => {
  it("uses authoritative OUTPUT2 evidence for net, GST, gross, paid and outstanding", () => {
    expect(resolveRetentionClaimGstPresentation({
      currentEvidence: output2,
      pushedEvidence: output2,
      hasPushedRevision: true,
      providerPayment: { paidMinor: 0, outstandingMinor: 115_000 },
    })).toEqual({
      current: output2,
      pushed: output2,
      newSincePush: {
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
        taxType: "OUTPUT2",
        effectiveRate: 15,
      },
      payment: { paidMinor: 0, outstandingMinor: 115_000 },
    });
  });

  it.each(["NONE", "ZERORATED"])(
    "preserves %s as distinct zero-tax evidence before push",
    (taxType) => {
      const evidence = {
        subtotalMinor: 100_000,
        taxMinor: 0,
        totalMinor: 100_000,
        taxType,
        effectiveRate: 0,
      };
      const result = resolveRetentionClaimGstPresentation({
        currentEvidence: evidence,
        pushedEvidence: null,
        hasPushedRevision: false,
        providerPayment: null,
      });

      expect(result.current).toEqual(evidence);
      expect(result.pushed).toEqual({
        ...evidence,
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
      });
      expect(result.newSincePush).toEqual(evidence);
      expect(result.payment).toBeNull();
    },
  );

  it("does not invent GST when origin evidence is missing", () => {
    expect(resolveRetentionClaimGstPresentation({
      currentEvidence: null,
      pushedEvidence: null,
      hasPushedRevision: false,
      providerPayment: null,
    })).toEqual({
      current: null,
      pushed: null,
      newSincePush: null,
      payment: null,
    });
  });

  it("rejects non-reconciling presentation evidence", () => {
    expect(resolveRetentionClaimGstPresentation({
      currentEvidence: { ...output2, totalMinor: 114_999 },
      pushedEvidence: null,
      hasPushedRevision: false,
      providerPayment: null,
    }).current).toBeNull();
  });
});
