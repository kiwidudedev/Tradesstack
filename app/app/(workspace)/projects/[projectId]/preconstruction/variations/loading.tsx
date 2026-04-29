import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectVariationsLoading() {
  return <BoardLoadingSkeleton title="Variations" metricCount={1} tableRows={5} />;
}
