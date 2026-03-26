import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrganizationSettingsForm } from "./OrganizationSettingsForm";
import { ProjectDeletionSettings } from "./ProjectDeletionSettings";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const currentMember = await getCurrentOrganizationMember();
  const supabase = await createServerSupabaseClient();

  const members = currentMember
    ? await supabase
        .from("organization_members")
        .select("id, user_id, display_name, role, created_at")
        .eq("organization_id", currentMember.organization_id)
        .order("created_at", { ascending: true })
    : { data: null, error: null };
  const organization = currentMember
    ? await supabase
        .from("organizations")
        .select("id, name, logo_path, created_by, created_at, updated_at")
        .eq("id", currentMember.organization_id)
        .maybeSingle()
    : { data: null, error: null };
  const projects = currentMember
    ? await supabase
        .from("organization_projects")
        .select("id, name, slug, created_at")
        .eq("organization_id", currentMember.organization_id)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const memberRows = members.error ? [] : (members.data ?? []);
  const organizationRow = organization.error ? null : (organization.data ?? null);
  const projectRows = projects.error ? [] : (projects.data ?? []);
  const initialLogoUrl = organizationRow?.logo_path
    ? supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path).data.publicUrl
    : null;

  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`${interMedium.className} max-w-2xl text-base font-medium leading-relaxed text-[#4d5b74]`}>
            Configure organization preferences, user management rules, and platform defaults from this settings area.
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-3 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Organization Users</CardTitle>
        </CardHeader>
        <CardContent>
          {!currentMember ? (
            <p className={`${interMedium.className} text-sm text-[#5f6f89]`}>You must be signed in to view organization users.</p>
          ) : memberRows.length === 0 ? (
            <p className={`${interMedium.className} text-sm text-[#5f6f89]`}>No users found for this organization yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[#E6EAF0]">
              <table className="min-w-full border-collapse text-left">
                <thead className="bg-[#F8FAFC] text-xs uppercase tracking-[0.08em] text-[#7b8ba4]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">User ID</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-[#1d2433]">
                  {memberRows.map((member) => (
                    <tr key={member.id} className="border-t border-[#E6EAF0]">
                      <td className="px-4 py-3">{member.display_name?.trim() || "Unnamed user"}</td>
                      <td className="px-4 py-3 capitalize">{member.role}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#5f6f89]">{member.user_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {currentMember && organizationRow ? (
        <OrganizationSettingsForm
          organizationId={organizationRow.id}
          initialName={organizationRow.name}
          initialLogoPath={organizationRow.logo_path}
          initialLogoUrl={initialLogoUrl}
          canEdit
        />
      ) : null}

      {currentMember ? (
        <ProjectDeletionSettings
          organizationId={currentMember.organization_id}
          projects={projectRows.map((project) => ({
            id: project.id,
            name: project.name,
            slug: project.slug,
          }))}
        />
      ) : null}
    </main>
  );
}
