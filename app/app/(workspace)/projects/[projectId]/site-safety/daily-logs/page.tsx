import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyDailyLogsPage() {
  return (
    <ProjectModulePlaceholder
      title="Daily Logs"
      description="Record daily work, site attendance, safety notes, photos, and delays."
      bullets={[
        "Daily attendance and crew activity",
        "Site notes and safety observations",
        "Progress photos and weather context",
        "Delay tracking and follow-up records",
      ]}
    />
  );
}
