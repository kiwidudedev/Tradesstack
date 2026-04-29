import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectJobManagementLoading() {
  return <BoardLoadingSkeleton title="Job Management" tableRows={4} />;
}
