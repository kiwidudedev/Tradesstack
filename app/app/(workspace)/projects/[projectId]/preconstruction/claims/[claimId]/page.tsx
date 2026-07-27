import { PaymentClaimDetailClient } from "./PaymentClaimDetailClient";
import { getPaymentClaimXeroPanelState } from "@/lib/xero/payment-claim-sales-invoice-panel";

export default async function ProjectClaimDetailPage(props: {
  params: Promise<{ projectId: string; claimId: string }>;
}) {
  const { claimId } = await props.params;
  const initialXeroPanelState = claimId === "new"
    ? undefined
    : await getPaymentClaimXeroPanelState({ claimId }).catch(() => undefined);

  return (
    <PaymentClaimDetailClient
      initialXeroPanelState={initialXeroPanelState}
    />
  );
}
