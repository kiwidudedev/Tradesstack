"use server";

import { loadPaymentClaimRegisterSnapshotForCurrentUser } from "./financials-register-snapshots";

export async function loadPaymentClaimRegisterSnapshotAction(
  projectSlug: string,
) {
  return loadPaymentClaimRegisterSnapshotForCurrentUser(projectSlug);
}
