import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectTodosLoading() {
  return <BoardLoadingSkeleton title="Tasks" metricCount={2} tableRows={5} />;
}
