import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyIncidentsPage() {
  return (
    <ProjectModulePlaceholder
      title="Incidents"
      description="Log incidents and near misses with photos, actions, and follow-up records."
      bullets={[
        "Incident and near-miss logging",
        "Photo evidence and supporting notes",
        "Immediate actions and follow-up items",
        "Outcome records for the project team",
      ]}
    />
  );
}
