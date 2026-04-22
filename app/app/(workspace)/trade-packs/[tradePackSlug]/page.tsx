import { redirect } from "next/navigation";

export default async function TradePackWorkspacePage({
  params,
}: {
  params: Promise<{ tradePackSlug: string }>;
}) {
  const { tradePackSlug } = await params;
  redirect(`/app/projects/${tradePackSlug}/dashboard`);
}

