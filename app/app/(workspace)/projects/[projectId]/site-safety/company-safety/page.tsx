import { ProjectModulePlaceholder } from "@/components/app/ProjectModulePlaceholder";

export default function ProjectSiteSafetyCompanySafetyPage() {
  return (
    <ProjectModulePlaceholder
      title="Company Safety"
      description="Store reusable company safety info, workers, certificates, policies, risks, and controls."
      bullets={[
        "Worker safety records and competencies",
        "Certificates, policies, and supporting documents",
        "Reusable risks and controls library",
        "Company-wide safety references for project setup",
      ]}
    />
  );
}
