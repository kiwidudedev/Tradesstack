import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error("This audit requires a Node.js runtime with process.loadEnvFile().");
  }

  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function readAll(client, table, columns, options = {}) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (options.orderBy) {
      query = query.order(options.orderBy, { ascending: true });
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`${table}: ${error.code ?? "query_error"} ${error.message}`);
    }

    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

function groupBy(rows, keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function countBy(rows, keyFor) {
  const result = {};
  for (const row of rows) {
    const key = keyFor(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sampleIds(rows, idFor = (row) => row.id) {
  return rows.slice(0, 20).map(idFor).filter(Boolean);
}

function anomaly(name, rows, idFor) {
  return {
    name,
    count: rows.length,
    sampleIds: sampleIds(rows, idFor),
  };
}

function classifyOpportunity(opportunity, mappingByOpportunity, projectsById) {
  const workspaceId = opportunity.workspace_project_id;
  const convertedId = opportunity.converted_project_id;
  const mapping = mappingByOpportunity.get(opportunity.id) ?? null;
  const mappedId = mapping?.project_id ?? null;
  const workspace = workspaceId ? projectsById.get(workspaceId) ?? null : null;
  const converted = convertedId ? projectsById.get(convertedId) ?? null : null;
  const mapped = mappedId ? projectsById.get(mappedId) ?? null : null;

  if (mappedId || convertedId) {
    if (
      workspaceId
      && convertedId
      && mappedId
      && workspaceId !== convertedId
      && convertedId === mappedId
      && workspace
      && converted
    ) {
      return "historical_two_project_consistent";
    }

    if (
      workspaceId
      && convertedId
      && mappedId
      && workspaceId === convertedId
      && convertedId === mappedId
      && workspace
    ) {
      return "same_project_already_present";
    }

    return "converted_or_mapped_inconsistent";
  }

  if (workspaceId && workspace) return "unconverted_with_workspace";
  if (workspaceId && !workspace) return "unconverted_missing_workspace_project";
  return "unconverted_without_workspace";
}

loadLocalEnv();

const client = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const [
  opportunities,
  projects,
  finalMappings,
  quotes,
  quoteLines,
  opportunityQuotes,
  opportunityQuoteLines,
  commercialItems,
  costItems,
  documentLinks,
  tasks,
] = await Promise.all([
  readAll(
    client,
    "organization_opportunities",
    "id,organization_id,workspace_project_id,converted_project_id,stage,created_at",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "organization_projects",
    "id,organization_id,source_opportunity_id,slug,stage,created_at",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "opportunity_final_projects",
    "opportunity_id,organization_id,project_id,accepted_quote_id,created_at",
    { orderBy: "opportunity_id" },
  ),
  readAll(
    client,
    "project_quotes",
    "id,organization_id,project_id,originating_opportunity_id,source_opportunity_id,status,updated_at",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "project_quote_line_items",
    "id,organization_id,project_id,quote_id,source_opportunity_quote_id,source_opportunity_quote_line_item_id",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "opportunity_quotes",
    "id,organization_id,opportunity_id,status,updated_at",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "opportunity_quote_line_items",
    "id,organization_id,quote_id",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "commercial_items",
    "id,organization_id,opportunity_id,project_id",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "cost_items",
    "id,organization_id,project_id,source_document_kind,source_document_id,source_line_table,source_line_id,linked_quote_line_item_id,linked_opportunity_quote_line_item_id,status,is_current,effective_to",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "document_workspace_entities",
    "id,organization_id,workspace_id,opportunity_id,project_id",
    { orderBy: "id" },
  ),
  readAll(
    client,
    "project_job_todos",
    "id,organization_id,project_id,opportunity_id",
    { orderBy: "id" },
  ),
]);

const projectsById = new Map(projects.map((row) => [row.id, row]));
const opportunitiesById = new Map(opportunities.map((row) => [row.id, row]));
const mappingByOpportunity = new Map(
  finalMappings.map((row) => [row.opportunity_id, row]),
);
const mappingByProject = new Map(finalMappings.map((row) => [row.project_id, row]));
const quotesById = new Map(quotes.map((row) => [row.id, row]));
const opportunityQuotesById = new Map(
  opportunityQuotes.map((row) => [row.id, row]),
);
const quoteLinesById = new Map(quoteLines.map((row) => [row.id, row]));
const opportunityQuoteLinesById = new Map(
  opportunityQuoteLines.map((row) => [row.id, row]),
);
const quotesByOpportunity = groupBy(
  quotes.filter((row) => row.originating_opportunity_id),
  (row) => row.originating_opportunity_id,
);
const workspaceUsers = groupBy(
  opportunities.filter((row) => row.workspace_project_id),
  (row) => row.workspace_project_id,
);

const opportunityClassifications = opportunities.map((opportunity) => ({
  id: opportunity.id,
  classification: classifyOpportunity(
    opportunity,
    mappingByOpportunity,
    projectsById,
  ),
}));

const sharedWorkspaceOpportunities = [...workspaceUsers.entries()]
  .filter(([, rows]) => rows.length > 1)
  .flatMap(([workspaceProjectId, rows]) =>
    rows.map((row) => ({ id: row.id, workspaceProjectId })),
  );

const missingWorkspaceLineage = opportunities
  .filter((row) => row.workspace_project_id)
  .filter((row) => {
    const project = projectsById.get(row.workspace_project_id);
    return !project || project.source_opportunity_id !== row.id;
  });

function workspaceLineageReason(opportunity) {
  const project = opportunity.workspace_project_id
    ? projectsById.get(opportunity.workspace_project_id)
    : null;
  if (!project) return "workspace_project_missing";
  if (project.organization_id !== opportunity.organization_id) {
    return "workspace_organization_mismatch";
  }
  if (project.source_opportunity_id == null) return "workspace_source_null";
  if (project.source_opportunity_id !== opportunity.id) {
    return "workspace_source_points_to_other_opportunity";
  }
  return "valid";
}

const crossOrganizationWorkspace = opportunities
  .filter((row) => row.workspace_project_id)
  .filter((row) => {
    const project = projectsById.get(row.workspace_project_id);
    return project && project.organization_id !== row.organization_id;
  });

const mappingMismatches = finalMappings.filter((mapping) => {
  const opportunity = opportunitiesById.get(mapping.opportunity_id);
  const project = projectsById.get(mapping.project_id);
  return (
    !opportunity
    || !project
    || mapping.organization_id !== opportunity.organization_id
    || mapping.organization_id !== project.organization_id
    || opportunity.converted_project_id !== mapping.project_id
    || project.source_opportunity_id !== opportunity.id
  );
});

const orphanFinalCandidates = projects.filter((project) => {
  if (!project.source_opportunity_id) return false;
  const opportunity = opportunitiesById.get(project.source_opportunity_id);
  if (!opportunity) return true;
  return (
    project.id !== opportunity.workspace_project_id
    && project.id !== opportunity.converted_project_id
    && !mappingByProject.has(project.id)
  );
});

const duplicateAcceptedOpportunities = [...quotesByOpportunity.entries()]
  .map(([opportunityId, rows]) => ({
    id: opportunityId,
    acceptedQuoteIds: rows
      .filter((row) => row.status === "Accepted")
      .map((row) => row.id),
  }))
  .filter((row) => row.acceptedQuoteIds.length > 1);

const invalidMappedBaselines = finalMappings.filter((mapping) => {
  const quote = mapping.accepted_quote_id
    ? quotesById.get(mapping.accepted_quote_id)
    : null;
  return (
    !quote
    || quote.organization_id !== mapping.organization_id
    || quote.originating_opportunity_id !== mapping.opportunity_id
    || quote.status !== "Accepted"
    || quote.project_id !== mapping.project_id
  );
});

function mappedBaselineReason(mapping) {
  if (!mapping.accepted_quote_id) return "mapping_has_no_accepted_quote";
  const quote = quotesById.get(mapping.accepted_quote_id);
  if (!quote) return "mapped_quote_missing";
  if (quote.organization_id !== mapping.organization_id) {
    return "mapped_quote_organization_mismatch";
  }
  if (quote.originating_opportunity_id !== mapping.opportunity_id) {
    return "mapped_quote_opportunity_mismatch";
  }
  if (quote.status !== "Accepted") return "mapped_quote_not_accepted";
  if (quote.project_id !== mapping.project_id) {
    return quote.project_id == null
      ? "mapped_quote_project_null"
      : "mapped_quote_owned_by_different_project";
  }
  return "valid";
}

const unrelatedQuoteOwnership = quotes.filter((quote) => {
  const opportunityId =
    quote.originating_opportunity_id ?? quote.source_opportunity_id;
  if (!opportunityId || !quote.project_id) return false;
  const opportunity = opportunitiesById.get(opportunityId);
  if (!opportunity) return true;
  return ![
    opportunity.workspace_project_id,
    opportunity.converted_project_id,
    mappingByOpportunity.get(opportunity.id)?.project_id,
  ].includes(quote.project_id);
});

const quoteLineOwnershipMismatches = quoteLines.filter((line) => {
  const quote = quotesById.get(line.quote_id);
  if (!quote) return true;
  return line.project_id !== quote.project_id;
});

const unrelatedCommercialOwnership = commercialItems.filter((item) => {
  const opportunity = opportunitiesById.get(item.opportunity_id);
  if (!opportunity || !item.project_id) return false;
  return ![
    opportunity.workspace_project_id,
    opportunity.converted_project_id,
    mappingByOpportunity.get(opportunity.id)?.project_id,
  ].includes(item.project_id);
});

const quoteDerivedCostOwnershipMismatches = costItems.filter((item) => {
  if (item.source_document_kind !== "project_quote") return false;
  const quote = quotesById.get(item.source_document_id);
  if (!quote) return true;
  return item.project_id !== quote.project_id;
});

function quoteCostMismatchReason(item) {
  const quote = quotesById.get(item.source_document_id);
  if (!quote) {
    if (opportunityQuotesById.has(item.source_document_id)) {
      return "project_quote_kind_references_legacy_opportunity_quote";
    }
    return "source_quote_missing_from_both_quote_tables";
  }
  if (quote.project_id == null && item.project_id != null) {
    const opportunityId =
      quote.originating_opportunity_id ?? quote.source_opportunity_id;
    const opportunity = opportunityId
      ? opportunitiesById.get(opportunityId)
      : null;
    if (opportunity?.workspace_project_id === item.project_id) {
      return "quote_null_cost_owned_by_workspace";
    }
    return "quote_null_cost_owned_by_other_project";
  }
  if (quote.project_id != null && item.project_id == null) {
    return "quote_project_set_cost_project_null";
  }
  return "quote_and_cost_owned_by_different_projects";
}

function quoteCostSourceLineReason(item) {
  if (item.linked_quote_line_item_id) {
    return quoteLinesById.has(item.linked_quote_line_item_id)
      ? "linked_project_quote_line_present"
      : "linked_project_quote_line_missing";
  }
  if (item.linked_opportunity_quote_line_item_id) {
    return opportunityQuoteLinesById.has(
      item.linked_opportunity_quote_line_item_id,
    )
      ? "linked_opportunity_quote_line_present"
      : "linked_opportunity_quote_line_missing";
  }
  if (item.source_line_table === "project_quote_line_items") {
    return quoteLinesById.has(item.source_line_id)
      ? "source_project_quote_line_present"
      : "source_project_quote_line_missing";
  }
  if (item.source_line_table === "opportunity_quote_line_items") {
    return opportunityQuoteLinesById.has(item.source_line_id)
      ? "source_opportunity_quote_line_present"
      : "source_opportunity_quote_line_missing";
  }
  return "no_line_reference";
}

function projectLifecycleClass(projectId) {
  const project = projectsById.get(projectId);
  if (!project) return "project_missing";
  const mapping = mappingByProject.get(projectId);
  if (mapping) return "historical_final_project";
  const workspaceOpportunity = opportunities.find(
    (row) => row.workspace_project_id === projectId,
  );
  if (workspaceOpportunity) {
    return workspaceOpportunity.converted_project_id
      ? "historical_tender_workspace"
      : "unconverted_tender_workspace";
  }
  if (project.source_opportunity_id) return "orphan_final_candidate";
  return "direct_project";
}

const documentLinkGroups = groupBy(
  documentLinks.filter((row) => row.opportunity_id || row.project_id),
  (row) => row.workspace_id,
);
const historicalDocumentDiscontinuities = opportunities
  .filter((row) => row.converted_project_id)
  .filter((row) => {
    const linkedWorkspaceIds = unique(
      documentLinks
        .filter(
          (link) =>
            link.opportunity_id === row.id
            || link.project_id === row.converted_project_id,
        )
        .map((link) => link.workspace_id),
    );
    return linkedWorkspaceIds.length > 1;
  });

const taskOwnershipMismatches = tasks.filter((task) => {
  if (!task.opportunity_id) return false;
  const opportunity = opportunitiesById.get(task.opportunity_id);
  return !opportunity || task.project_id !== opportunity.workspace_project_id;
});

const mappedOpportunityStageMismatches = finalMappings.filter((mapping) => {
  const opportunity = opportunitiesById.get(mapping.opportunity_id);
  return !opportunity || opportunity.stage !== "Won";
});
const wonWithoutFinalMapping = opportunities.filter(
  (opportunity) =>
    opportunity.stage === "Won" && !mappingByOpportunity.has(opportunity.id),
);

const report = {
  audit: "TradesStack Opportunity promotion Stage 0 census",
  generatedAt: new Date().toISOString(),
  mode: "read_only_supabase_rest",
  totals: {
    opportunities: opportunities.length,
    projects: projects.length,
    finalMappings: finalMappings.length,
    quotes: quotes.length,
    quoteLines: quoteLines.length,
    legacyOpportunityQuotes: opportunityQuotes.length,
    legacyOpportunityQuoteLines: opportunityQuoteLines.length,
    commercialItems: commercialItems.length,
    costItems: costItems.length,
    documentLinks: documentLinks.length,
    documentWorkspacesLinkedToEntities: documentLinkGroups.size,
    tasks: tasks.length,
  },
  opportunityClassifications: countBy(
    opportunityClassifications,
    (row) => row.classification,
  ),
  opportunityStages: countBy(opportunities, (row) => row.stage ?? "NULL"),
  projectStages: countBy(projects, (row) => row.stage ?? "NULL"),
  classifiedLegacyDetails: {
    unconvertedWithoutWorkspace: opportunities
      .filter(
        (row) =>
          classifyOpportunity(row, mappingByOpportunity, projectsById)
          === "unconverted_without_workspace",
      )
      .map((row) => ({
        id: row.id,
        stage: row.stage,
        createdAt: row.created_at,
      })),
    workspaceLineageReasons: countBy(
      missingWorkspaceLineage,
      workspaceLineageReason,
    ),
    workspaceLineageCases: missingWorkspaceLineage.map((row) => ({
      opportunityId: row.id,
      workspaceProjectId: row.workspace_project_id,
      stage: row.stage,
      reason: workspaceLineageReason(row),
    })),
    orphanFinalCandidates: orphanFinalCandidates.map((project) => {
      const opportunity = project.source_opportunity_id
        ? opportunitiesById.get(project.source_opportunity_id)
        : null;
      return {
        projectId: project.id,
        sourceOpportunityId: project.source_opportunity_id,
        opportunityStage: opportunity?.stage ?? null,
        workspaceProjectId: opportunity?.workspace_project_id ?? null,
        convertedProjectId: opportunity?.converted_project_id ?? null,
        mappedProjectId:
          mappingByOpportunity.get(project.source_opportunity_id)?.project_id
          ?? null,
        projectStage: project.stage,
        createdAt: project.created_at,
      };
    }),
    acceptedQuoteMultiplicity: duplicateAcceptedOpportunities,
    mappedBaselineReasons: countBy(
      invalidMappedBaselines,
      mappedBaselineReason,
    ),
    mappedBaselineCases: invalidMappedBaselines.map((mapping) => ({
      opportunityId: mapping.opportunity_id,
      projectId: mapping.project_id,
      acceptedQuoteId: mapping.accepted_quote_id,
      reason: mappedBaselineReason(mapping),
    })),
    quoteCostMismatchReasons: countBy(
      quoteDerivedCostOwnershipMismatches,
      quoteCostMismatchReason,
    ),
    quoteCostMismatchLifecycle: countBy(
      quoteDerivedCostOwnershipMismatches,
      (row) =>
        `${row.status ?? "NULL"}:${row.is_current === true ? "current" : "not_current"}`,
    ),
    quoteCostMismatchSourceLines: countBy(
      quoteDerivedCostOwnershipMismatches,
      quoteCostSourceLineReason,
    ),
    quoteCostMismatchProjectLifecycle: countBy(
      quoteDerivedCostOwnershipMismatches,
      (row) => projectLifecycleClass(row.project_id),
    ),
    quoteCostMismatchUniqueProjects: unique(
      quoteDerivedCostOwnershipMismatches.map((row) => row.project_id),
    ).length,
    quoteCostMismatchUniqueSourceDocuments: unique(
      quoteDerivedCostOwnershipMismatches.map(
        (row) => row.source_document_id,
      ),
    ).length,
    quoteCostMismatchCases: quoteDerivedCostOwnershipMismatches.map((row) => ({
      costItemId: row.id,
      projectId: row.project_id,
      sourceDocumentId: row.source_document_id,
      sourceDocumentReason: quoteCostMismatchReason(row),
      sourceLineReason: quoteCostSourceLineReason(row),
      projectLifecycle: projectLifecycleClass(row.project_id),
      status: row.status,
      isCurrent: row.is_current,
    })),
    mappedOpportunityStageCases: mappedOpportunityStageMismatches.map(
      (mapping) => ({
        opportunityId: mapping.opportunity_id,
        mappedProjectId: mapping.project_id,
        stage: opportunitiesById.get(mapping.opportunity_id)?.stage ?? null,
      }),
    ),
    wonWithoutFinalMapping: wonWithoutFinalMapping.map((row) => ({
      opportunityId: row.id,
      workspaceProjectId: row.workspace_project_id,
      convertedProjectId: row.converted_project_id,
    })),
  },
  anomalies: [
    anomaly("shared_workspace_projects", sharedWorkspaceOpportunities),
    anomaly("missing_or_incorrect_workspace_source_lineage", missingWorkspaceLineage),
    anomaly("cross_organization_workspace_reference", crossOrganizationWorkspace),
    anomaly("final_mapping_or_converted_lineage_mismatch", mappingMismatches, (row) => row.opportunity_id),
    anomaly("orphan_final_project_candidate", orphanFinalCandidates),
    anomaly("multiple_accepted_quotes_for_opportunity", duplicateAcceptedOpportunities),
    anomaly("invalid_or_unattached_mapped_baseline", invalidMappedBaselines, (row) => row.opportunity_id),
    anomaly("quote_owned_by_unrelated_project", unrelatedQuoteOwnership),
    anomaly("quote_line_project_differs_from_quote", quoteLineOwnershipMismatches),
    anomaly("commercial_item_owned_by_unrelated_project", unrelatedCommercialOwnership),
    anomaly(
      "quote_cost_item_source_missing_or_project_differs",
      quoteDerivedCostOwnershipMismatches,
    ),
    anomaly("historical_document_workspace_discontinuity", historicalDocumentDiscontinuities),
    anomaly("opportunity_task_project_differs_from_workspace", taskOwnershipMismatches),
    anomaly(
      "final_mapping_opportunity_not_won",
      mappedOpportunityStageMismatches,
      (row) => row.opportunity_id,
    ),
    anomaly("won_opportunity_without_final_mapping", wonWithoutFinalMapping),
  ],
};

console.log(JSON.stringify(report, null, 2));
