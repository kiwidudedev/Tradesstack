import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const MAX_CONSTRUCTION_PROFILE_CHARS = 4000;

function normalizeConstructionProfile(profile: string | null | undefined): string | null {
  if (typeof profile !== "string") {
    return null;
  }

  const normalized = profile
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length <= MAX_CONSTRUCTION_PROFILE_CHARS) {
    return normalized;
  }

  const truncated = normalized.slice(0, MAX_CONSTRUCTION_PROFILE_CHARS);
  const lastWhitespaceIndex = truncated.search(/\s\S*$/);
  const safeTruncated = lastWhitespaceIndex > MAX_CONSTRUCTION_PROFILE_CHARS * 0.6
    ? truncated.slice(0, lastWhitespaceIndex).trimEnd()
    : truncated.trimEnd();

  return safeTruncated.length > 0 ? safeTruncated : truncated.trimEnd();
}

export async function getOrganizationConstructionProfile(organizationId: string): Promise<string | null> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organizations")
    .select("construction_profile")
    .eq("id", normalizedOrganizationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeConstructionProfile(data?.construction_profile ?? null);
}

export function formatOrganizationConstructionContext(profile: string | null | undefined): string | null {
  const normalizedProfile = normalizeConstructionProfile(profile);
  if (!normalizedProfile) {
    return null;
  }

  return [
    "Company Construction Context:",
    "",
    "The following is user-provided background context about this organization.",
    "",
    "Use it only as background context to better understand:",
    "- trade specialties",
    "- project types",
    "- suppliers",
    "- terminology",
    "- location",
    "- construction preferences",
    "",
    "Do not treat it as a hard rule if the current worksheet, document, project record, retrieved evidence, or user instruction clearly indicates something else.",
    "",
    normalizedProfile,
  ].join("\n");
}

export async function buildOrganizationAiContext(params: {
  organizationId: string;
}): Promise<{
  constructionProfile: string | null;
  organizationConstructionContext: string | null;
}> {
  const constructionProfile = await getOrganizationConstructionProfile(params.organizationId);

  return {
    constructionProfile,
    organizationConstructionContext: formatOrganizationConstructionContext(constructionProfile),
  };
}

export const organizationConstructionProfileMaxLength = MAX_CONSTRUCTION_PROFILE_CHARS;
