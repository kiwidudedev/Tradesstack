import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectQuoteLoading() {
  return <BoardLoadingSkeleton title="Quotation" metricCount={1} tableRows={6} />;
}
