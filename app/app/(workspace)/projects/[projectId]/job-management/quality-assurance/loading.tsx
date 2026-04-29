import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectQualityAssuranceLoading() {
  return <BoardLoadingSkeleton title="QA" metricCount={4} tableRows={4} />;
}
