import { buildOrganizationAiContext } from "@/lib/organization-ai-context";
import type { UniversalLearningCompanyConstructionProfile } from "@/lib/universal-learning/types";

function inferNormalizedProfile(profile: string | null): Record<string, string | string[] | null> {
  if (!profile) {
    return {
      companyName: null,
      primaryRegion: null,
      workType: null,
      likelyProjectTypes: [],
      knownSystems: [],
      knownBrands: [],
    };
  }

  const lines = profile.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? null;
  const lower = profile.toLowerCase();
  const knownBrands = ["Rondo", "GIB", "PlaceMakers", "ITM"].filter((brand) =>
    lower.includes(brand.toLowerCase()),
  );

  const likelyProjectTypes: string[] = [];
  if (lower.includes("fitout")) {
    likelyProjectTypes.push("fitout");
  }
  if (lower.includes("refurb")) {
    likelyProjectTypes.push("refurbishment");
  }
  if (lower.includes("commercial")) {
    likelyProjectTypes.push("commercial");
  }

  const knownSystems: string[] = [];
  if (lower.includes("gib") || lower.includes("plasterboard")) {
    knownSystems.push("plasterboard wall");
  }
  if (lower.includes("rondo") || lower.includes("ceiling")) {
    knownSystems.push("suspended ceilings");
  }

  return {
    companyName: firstLine,
    primaryRegion: lower.includes("auckland") ? "Auckland" : null,
    workType: lower.includes("commercial interiors") ? "commercial interiors" : null,
    likelyProjectTypes,
    knownSystems,
    knownBrands,
  };
}

export async function loadUniversalLearningConstructionProfile(
  organizationId: string,
): Promise<UniversalLearningCompanyConstructionProfile> {
  const context = await buildOrganizationAiContext({ organizationId });
  return {
    rawProfile: context.constructionProfile,
    normalizedProfile: inferNormalizedProfile(context.constructionProfile),
  };
}
