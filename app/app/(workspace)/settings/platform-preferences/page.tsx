import { ProjectDeletionSettings } from "../ProjectDeletionSettings";
import { getSettingsContext } from "../settings-data";

export default async function PlatformPreferencesPage() {
  const { currentMember, projectRows } = await getSettingsContext();

  if (!currentMember) {
    return null;
  }

  return (
    <ProjectDeletionSettings
      organizationId={currentMember.organization_id}
      projects={projectRows.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
      }))}
    />
  );
}
