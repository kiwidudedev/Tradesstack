import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyPlansPage() {
  return (
    <ProjectModulePlaceholder
      title="Safety Plans (SSSP)"
      description="Create reusable company safety plans and project-specific SSSPs."
      ctaLabel="Start building here"
      bullets={[
        "Reusable company safety plans",
        "Project-specific SSSP setup",
        "Site risks and control summaries",
        "Supporting documents and sign-off structure",
      ]}
    />
  );
}
