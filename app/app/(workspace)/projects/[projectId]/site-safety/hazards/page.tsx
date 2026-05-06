import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyHazardsPage() {
  return (
    <ProjectModulePlaceholder
      title="Hazards"
      description="Capture hazards, controls, risk level, actions, and status."
      bullets={[
        "Hazard capture and site location context",
        "Control measures and responsible people",
        "Risk level and review status",
        "Actions needed before close-out",
      ]}
    />
  );
}
