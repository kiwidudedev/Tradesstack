import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyToolboxTalksPage() {
  return (
    <ProjectModulePlaceholder
      title="Toolbox Talks"
      description="Record toolbox meetings, attendees, topics, and sign-offs."
      bullets={[
        "Meeting topics and discussion notes",
        "Attendee records and trade coverage",
        "Sign-off structure for workers on site",
        "Reusable toolbox talk templates",
      ]}
    />
  );
}
