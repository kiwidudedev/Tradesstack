import "server-only";

import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { resolveUniqueProjectSlug, toProjectSlug, type ProjectStage } from "@/lib/projects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface CreateOrganizationProjectInput {
  name: string;
  clientId?: string | null;
  stage?: ProjectStage;
  location?: string | null;
  coverImageUrl?: string | null;
  sourceOpportunityId?: string | null;
  slugBaseName?: string | null;
}

export interface CreatedOrganizationProject {
  id: string;
  slug: string;
  organizationId: string;
}

export async function createOrganizationProjectForCurrentUser(
  input: CreateOrganizationProjectInput
): Promise<CreatedOrganizationProject> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Project name is required.");
  }

  const slugSeed = (input.slugBaseName ?? name).trim();
  if (!slugSeed) {
    throw new Error("Project slug source is required.");
  }

  const supabase = await createServerSupabaseClient();

  const sourceOpportunityId = input.sourceOpportunityId?.trim() || null;
  if (sourceOpportunityId) {
    const sourceOpportunityResult = await supabase
      .from("organization_opportunities")
      .select("id")
      .eq("organization_id", member.organization_id)
      .eq("id", sourceOpportunityId)
      .maybeSingle();

    if (sourceOpportunityResult.error) {
      throw new Error(sourceOpportunityResult.error.message);
    }

    if (!sourceOpportunityResult.data) {
      throw new Error("Source opportunity not found.");
    }
  }

  const baseSlug = toProjectSlug(slugSeed);
  const existingProjectSlugsResult = await supabase
    .from("organization_projects")
    .select("slug")
    .eq("organization_id", member.organization_id)
    .like("slug", `${baseSlug}%`);

  if (existingProjectSlugsResult.error) {
    throw new Error(existingProjectSlugsResult.error.message);
  }

  const slug = resolveUniqueProjectSlug(
    baseSlug,
    (existingProjectSlugsResult.data ?? []).map((row) => row.slug)
  );

  const createProjectResult = await supabase
    .from("organization_projects")
    .insert({
      organization_id: member.organization_id,
      created_by: member.user_id,
      client_id: input.clientId ?? null,
      name,
      slug,
      stage: input.stage ?? "Pricing",
      location: input.location?.trim() || "Unspecified",
      cover_image_url: input.coverImageUrl ?? null,
      source_opportunity_id: sourceOpportunityId,
    })
    .select("id, slug, organization_id")
    .single();

  if (createProjectResult.error) {
    throw new Error(createProjectResult.error.message);
  }

  return {
    id: createProjectResult.data.id,
    slug: createProjectResult.data.slug,
    organizationId: createProjectResult.data.organization_id,
  };
}
