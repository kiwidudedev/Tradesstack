import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function rows(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

const events = rows(
  await supabase
    .from("opportunity_promotion_events")
    .select("organization_id,opportunity_id,project_id,strategy,strategy_version")
    .eq("strategy", "promote_workspace_v1")
    .eq("strategy_version", 1),
  "promotion events",
);

const opportunityIds = [...new Set(events.map((row) => row.opportunity_id))];
const projectIds = [...new Set(events.map((row) => row.project_id))];
const opportunities = opportunityIds.length
  ? rows(
      await supabase
        .from("organization_opportunities")
        .select("id,organization_id,name,slug,workspace_project_id,converted_project_id")
        .in("id", opportunityIds),
      "opportunities",
    )
  : [];
const projects = projectIds.length
  ? rows(
      await supabase
        .from("organization_projects")
        .select("id,organization_id,name,slug,project_code,source_opportunity_id")
        .in("id", projectIds),
      "projects",
    )
  : [];
const mappings = opportunityIds.length
  ? rows(
      await supabase
        .from("opportunity_final_projects")
        .select("organization_id,opportunity_id,project_id")
        .in("opportunity_id", opportunityIds),
      "final mappings",
    )
  : [];
const organizationIds = [...new Set(events.map((row) => row.organization_id))];
const organizationProjects = organizationIds.length
  ? rows(
      await supabase
        .from("organization_projects")
        .select("id,organization_id,slug")
        .in("organization_id", organizationIds),
      "organization Project slug catalog",
    )
  : [];

const opportunityById = new Map(opportunities.map((row) => [row.id, row]));
const projectById = new Map(projects.map((row) => [row.id, row]));
const mappingByOpportunity = new Map(mappings.map((row) => [row.opportunity_id, row]));
const report = [];

for (const event of events) {
  const opportunity = opportunityById.get(event.opportunity_id);
  const project = projectById.get(event.project_id);
  const mapping = mappingByOpportunity.get(event.opportunity_id);
  const sameProjectEvidence = Boolean(
    opportunity &&
      project &&
      mapping &&
      opportunity.workspace_project_id === project.id &&
      opportunity.converted_project_id === project.id &&
      mapping.project_id === project.id &&
      project.source_opportunity_id === opportunity.id,
  );
  const generatedName = Boolean(
    opportunity && project?.name === `${opportunity.name} Tender Workspace`,
  );
  const generatedSlug = Boolean(
    opportunity && project?.slug === `${opportunity.slug}-tender`,
  );
  const canonicalSlugCollision = opportunity
    ? organizationProjects.find(
        (candidate) =>
          candidate.organization_id === event.organization_id &&
          candidate.id !== event.project_id &&
          candidate.slug.toLowerCase() === opportunity.slug.toLowerCase(),
      )
    : null;

  report.push({
    opportunity_id: event.opportunity_id,
    project_id: event.project_id,
    project_code: project?.project_code ?? null,
    current_name: project?.name ?? null,
    current_slug: project?.slug ?? null,
    classification: !sameProjectEvidence
      ? "ambiguous_evidence"
      : generatedName && generatedSlug
        ? "safe_generated_metadata"
        : generatedName || generatedSlug
          ? "ambiguous_partial_match"
          : "custom_or_already_clean",
    alias_required: Boolean(generatedSlug),
    canonical_slug_collision_project_id: canonicalSlugCollision?.id ?? null,
  });
}

const summary = {
  total_promoted_projects: report.length,
  names_ending_tender_workspace: report.filter((row) =>
    row.current_name?.endsWith(" Tender Workspace"),
  ).length,
  slugs_ending_tender: report.filter((row) => row.current_slug?.endsWith("-tender")).length,
  safe_generated_metadata: report.filter(
    (row) => row.classification === "safe_generated_metadata",
  ).length,
  customized_or_already_clean: report.filter(
    (row) => row.classification === "custom_or_already_clean",
  ).length,
  ambiguous: report.filter((row) => row.classification.startsWith("ambiguous")).length,
  aliases_required: report.filter((row) => row.alias_required).length,
  canonical_slug_collisions: report.filter(
    (row) => row.canonical_slug_collision_project_id !== null,
  ).length,
};

console.log(JSON.stringify({ summary, projects: report }, null, 2));
