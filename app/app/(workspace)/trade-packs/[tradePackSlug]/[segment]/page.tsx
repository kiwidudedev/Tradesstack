import { redirect } from "next/navigation";

export default async function TradePackWorkspaceSegmentPage({
  params,
}: {
  params: Promise<{ tradePackSlug: string; segment: string }>;
}) {
  const { tradePackSlug, segment } = await params;
  redirect(`/app/projects/${tradePackSlug}/${segment}`);
}

