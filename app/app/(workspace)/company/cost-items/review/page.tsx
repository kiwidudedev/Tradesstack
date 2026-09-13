import { redirect } from "next/navigation";

/** Retained only so old bookmarks reach the accounting readiness settings. */
export default function RetiredCostItemReviewPage() {
  redirect("/app/settings/integrations");
}
