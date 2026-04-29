import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectClaimsLoading() {
  return <BoardLoadingSkeleton title="Claims" metricCount={3} tableRows={5} />;
}
