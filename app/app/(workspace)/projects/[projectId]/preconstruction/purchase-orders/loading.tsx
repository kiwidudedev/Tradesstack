import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectPurchaseOrdersLoading() {
  return <BoardLoadingSkeleton title="Purchase Orders" metricCount={1} tableRows={5} />;
}
