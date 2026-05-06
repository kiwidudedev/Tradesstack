import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyInductionsPage() {
  return (
    <ProjectModulePlaceholder
      title="Inductions"
      description="Track who is inducted on each project and store proof."
      bullets={[
        "Project induction records by worker",
        "Proof of induction and supporting files",
        "Induction status visibility",
        "Reusable induction content for future jobs",
      ]}
    />
  );
}
