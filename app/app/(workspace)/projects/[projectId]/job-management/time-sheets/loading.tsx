import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectTimeSheetsLoading() {
  return <BoardLoadingSkeleton title="Timesheets" metricCount={3} tableRows={5} />;
}
