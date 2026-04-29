import { BoardLoadingSkeleton } from "@/components/app/ProjectRouteSkeletons";

export default function ProjectPreconstructionLoading() {
  return <BoardLoadingSkeleton title="Financial" showFilters={false} tableRows={4} />;
}
