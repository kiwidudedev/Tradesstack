import { notFound, redirect } from "next/navigation";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { formatMoneyOperational } from "@/lib/format/currency";
import { getVisibleProjectIds } from "@/lib/opportunity-lifecycle-compatibility-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { opportunityQuoteDisplayNumber } from "@/lib/opportunity-quote-display";

export type ClientRow = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  created_at: string;
  updated_at: string;
};

export type OpportunityRow = {
  id: string;
  slug: string;
  opportunity_code?: string | null;
  name: string;
  stage: string;
  estimated_value: number | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectQuoteRow = {
  id: string;
  project_id: string;
  quote_title: string;
  quote_number: string;
  status: string;
  total_quote_price: number | null;
  created_at: string;
  updated_at: string;
};

export type OpportunityQuoteRow = {
  id: string;
  opportunity_id: string;
  quote_title: string;
  quote_number: string;
  revision_number?: number;
  status: string;
  total_quote_price: number | null;
  created_at: string;
  updated_at: string;
};

export type ClaimRow = {
  id: string;
  project_id: string;
  claim_number: string;
  claim_title: string;
  status: string | null;
  claim_date: string | null;
  due_date: string | null;
  claim_amount: number | null;
  paid_amount: number | null;
  notes: string | null;
  updated_at: string;
};

export type VariationRow = {
  id: string;
  project_id: string;
  variation_number: string;
  variation_title: string;
  status: string;
  total_variation_price: number | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function onlyVisibleProjects(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  organizationId: string;
  projects: ProjectRow[];
}) {
  const visibleProjectIds = await getVisibleProjectIds({
    client: params.supabase,
    organizationId: params.organizationId,
    candidateProjectIds: params.projects.map((project) => project.id),
  });
  return visibleProjectIds
    ? params.projects.filter((project) => visibleProjectIds.has(project.id))
    : params.projects;
}

export type DrawingSetRow = {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  created_at: string;
  download_url?: string | null;
};

export type ClientNoteRow = {
  id: string;
  client_id: string;
  author_name: string;
  body: string;
  sort_order: number;
  created_at: string;
};

export type ClientNoteEntry = {
  id: string;
  title: string;
  body: string;
  at: string;
  href: string;
  authorName: string;
  sortOrder: number;
};

type UntypedResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail: string;
  href: string | null;
};

export type RiskTone = "green" | "orange" | "red";

type ClientDetailDataOptions = {
  includeDrawingSets?: boolean;
};

type HeaderOpportunityRow = Pick<OpportunityRow, "id" | "stage">;

export function toMoney(value: number): string {
  return formatMoneyOperational(value);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function dayDiff(from: string | null | undefined, to: string | null | undefined): number | null {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (!fromDate || !toDateValue) return null;
  const ms = toDateValue.getTime() - fromDate.getTime();
  if (ms < 0) return null;
  return ms / (1000 * 60 * 60 * 24);
}

export function toPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function toNumeric(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function isOpenQuote(status: string): boolean {
  return status === "Draft" || status === "Ready to Send" || status === "Sent" || status === "Viewed";
}

export function quoteHref(
  quote: ProjectQuoteRow | OpportunityQuoteRow,
  projectById: Map<string, ProjectRow>,
  opportunityById: Map<string, OpportunityRow>
): string | null {
  if ("project_id" in quote) {
    const project = projectById.get(quote.project_id);
    return project ? `/app/projects/${project.slug}/preconstruction/quote/${quote.id}` : null;
  }
  const opportunity = opportunityById.get(quote.opportunity_id);
  return opportunity ? `/app/leads-clients/opportunities/${opportunity.slug}/quote` : null;
}

export function getQuoteStatusTone(status: string): "blue" | "green" | "yellow" | "slate" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "sent" || normalized === "viewed") return "blue";
  if (normalized === "accepted" || normalized === "approved" || normalized === "won") return "green";
  if (normalized === "draft" || normalized === "ready to send" || normalized === "pending") return "yellow";
  return "slate";
}

async function getClientBaseData(clientId: string) {
  const member = await getCurrentOrganizationMember();
  if (!member) redirect("/app/leads-clients/clients");

  const supabase = await createServerSupabaseClient();
  const [clientResult, projectsResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("id", clientId)
      .maybeSingle<ClientRow>(),
    supabase
      .from("organization_projects")
      .select("id, slug, name, stage, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .returns<ProjectRow[]>(),
    supabase
      .from("organization_opportunities")
      .select("id, slug, name, stage, estimated_value, due_date, notes, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .returns<OpportunityRow[]>(),
  ]);

  if (clientResult.error || !clientResult.data) notFound();

  const projects = await onlyVisibleProjects({
    supabase,
    organizationId: member.organization_id,
    projects: projectsResult.error ? [] : (projectsResult.data ?? []),
  });

  return {
    member,
    supabase,
    client: clientResult.data,
    projects,
    opportunities: opportunitiesResult.error ? [] : (opportunitiesResult.data ?? []),
  };
}

export async function getClientNotesTabData(clientId: string) {
  const { member, client, projects, opportunities, supabase } = await getClientBaseData(clientId);
  const clientNotesResult = await supabase
    .from("client_notes")
    .select("id, client_id, author_name, body, sort_order, created_at")
    .eq("organization_id", member.organization_id)
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<ClientNoteRow[]>();

  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");
  const clientNotes = clientNotesResult.error ? [] : (clientNotesResult.data ?? []);
  const noteEntries: ClientNoteEntry[] = clientNotes.map((note) => ({
    id: note.id,
    title: note.author_name.trim() || "Team member",
    body: note.body.trim(),
    at: note.created_at,
    href: `/app/leads-clients/clients/${client.id}/notes`,
    authorName: note.author_name.trim() || "Team member",
    sortOrder: note.sort_order,
  }));

  return {
    client,
    jobsInProgress,
    activeOpportunities,
    noteEntries,
  };
}

export async function getClientJobsTabData(clientId: string) {
  const { client, projects, opportunities } = await getClientBaseData(clientId);
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");

  return {
    client,
    projects,
    jobsInProgress,
    activeOpportunities,
  };
}

export async function getClientInvoicesTabData(clientId: string) {
  const member = await getCurrentOrganizationMember();
  if (!member) redirect("/app/leads-clients/clients");

  const supabase = await createServerSupabaseClient();
  const [clientResult, projectsResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("id", clientId)
      .maybeSingle<ClientRow>(),
    supabase
      .from("organization_projects")
      .select("id, slug, name, stage, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .returns<ProjectRow[]>(),
    supabase
      .from("organization_opportunities")
      .select("id, stage")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .returns<HeaderOpportunityRow[]>(),
  ]);

  if (clientResult.error || !clientResult.data) notFound();

  const client = clientResult.data;
  const projects = await onlyVisibleProjects({
    supabase,
    organizationId: member.organization_id,
    projects: projectsResult.error ? [] : (projectsResult.data ?? []),
  });
  const opportunities = opportunitiesResult.error ? [] : (opportunitiesResult.data ?? []);
  const projectIds = projects.map((project) => project.id);

  const claimsResult =
    projectIds.length > 0
      ? await (supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: string) => {
                in: (column: string, values: string[]) => Promise<UntypedResult<Record<string, unknown>>>;
              };
            };
          };
        })
          .from("project_claims")
          .select("id, project_id, claim_number, claim_title, status, claim_date, due_date, claim_amount, paid_amount, notes, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : { data: [] as Record<string, unknown>[], error: null };

  const claims = (claimsResult.error ? [] : (claimsResult.data ?? [])) as ClaimRow[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const recentClaims = [...claims].sort((left, right) => (right.due_date || right.updated_at).localeCompare(left.due_date || left.updated_at));
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");

  return {
    client,
    projectById,
    recentClaims,
    jobsInProgress,
    activeOpportunities,
  };
}

export async function getClientQuotesTabData(clientId: string) {
  const { member, client, projects, opportunities, supabase } = await getClientBaseData(clientId);
  const projectIds = projects.map((project) => project.id);

  type RecipientSeriesRow = {
    opportunity_id: string;
    opportunity: OpportunityRow | null;
    current_revision: OpportunityQuoteRow | null;
  };
  const seriesClient = supabase as unknown as {
    from(table: "opportunity_quote_series"): {
      select(columns: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            is(column: string, value: null): Promise<{ data: RecipientSeriesRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };

  const [projectQuotesResult, recipientSeriesResult] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("project_quotes")
          .select("id, project_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
          .is("quote_series_id", null)
          .returns<ProjectQuoteRow[]>()
      : Promise.resolve({ data: [] as ProjectQuoteRow[], error: null }),
    seriesClient
      .from("opportunity_quote_series")
      .select("opportunity_id, opportunity:organization_opportunities!opportunity_quote_series_org_opportunity_fkey(id,slug,opportunity_code,name,stage,estimated_value,due_date,notes,created_at,updated_at), current_revision:project_quotes!opportunity_quote_series_org_current_revision_fkey(id,originating_opportunity_id,quote_title,quote_number,revision_number,status,total_quote_price,created_at,updated_at)")
      .eq("organization_id", member.organization_id)
      .eq("recipient_client_id", clientId)
      .is("archived_at", null),
  ]);

  const projectQuotes = projectQuotesResult.error ? [] : (projectQuotesResult.data ?? []);
  const recipientSeries = recipientSeriesResult.error ? [] : (recipientSeriesResult.data ?? []);
  const opportunityQuotes = recipientSeries
    .map((series) => series.current_revision ? ({
      ...series.current_revision,
      quote_number: opportunityQuoteDisplayNumber(
        series.opportunity?.opportunity_code ?? series.current_revision.quote_number,
        series.current_revision.revision_number,
      ),
    }) : null)
    .filter((quote): quote is OpportunityQuoteRow => Boolean(quote));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const opportunityById = new Map([
    ...opportunities.map((opportunity) => [opportunity.id, opportunity] as const),
    ...recipientSeries.filter((series) => series.opportunity).map((series) => [series.opportunity_id, series.opportunity as OpportunityRow] as const),
  ]);
  const recentQuotes = [...projectQuotes, ...opportunityQuotes].sort((left, right) => (right.updated_at || right.created_at).localeCompare(left.updated_at || left.created_at));
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");

  return {
    client,
    projectById,
    opportunityById,
    recentQuotes,
    jobsInProgress,
    activeOpportunities,
  };
}

export async function getClientFilesTabData(clientId: string) {
  const member = await getCurrentOrganizationMember();
  if (!member) redirect("/app/leads-clients/clients");

  const supabase = await createServerSupabaseClient();
  const [clientResult, projectsResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("id", clientId)
      .maybeSingle<ClientRow>(),
    supabase
      .from("organization_projects")
      .select("id, slug, name, stage, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .returns<ProjectRow[]>(),
    supabase
      .from("organization_opportunities")
      .select("id, stage")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .returns<HeaderOpportunityRow[]>(),
  ]);

  if (clientResult.error || !clientResult.data) notFound();

  const client = clientResult.data;
  const projects = await onlyVisibleProjects({
    supabase,
    organizationId: member.organization_id,
    projects: projectsResult.error ? [] : (projectsResult.data ?? []),
  });
  const opportunities = opportunitiesResult.error ? [] : (opportunitiesResult.data ?? []);
  const projectIds = projects.map((project) => project.id);

  const filesResult =
    projectIds.length > 0
      ? await (supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: string) => {
                in: (column: string, values: string[]) => Promise<UntypedResult<Record<string, unknown>>>;
              };
            };
          };
        })
          .from("project_drawing_sets")
          .select("id, project_id, file_name, storage_path, file_size_bytes, created_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : { data: [] as Record<string, unknown>[], error: null };

  const drawingSets = (filesResult.error ? [] : (filesResult.data ?? [])) as DrawingSetRow[];
  const drawingSetsWithDownloads = await Promise.all(
    drawingSets.map(async (file) => {
      const signed = await supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).createSignedUrl(file.storage_path, 60 * 60);
      return {
        ...file,
        download_url: signed.error ? null : signed.data.signedUrl,
      };
    })
  );
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");

  return {
    client,
    drawingSets: drawingSetsWithDownloads,
    jobsInProgress,
    activeOpportunities,
  };
}

export async function getClientTimelineTabData(clientId: string) {
  const { member, client, projects, opportunities, supabase } = await getClientBaseData(clientId);
  const projectIds = projects.map((project) => project.id);
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);

  const untypedSupabase = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => Promise<UntypedResult<Record<string, unknown>>>;
        };
      };
    };
  };

  const [opportunityQuotesResult, claimsResult, variationsResult, clientNotesResult] = await Promise.all([
    opportunityIds.length > 0
      ? untypedSupabase
          .from("opportunity_quotes")
          .select("id, opportunity_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("opportunity_id", opportunityIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    projectIds.length > 0
      ? untypedSupabase
          .from("project_claims")
          .select("id, project_id, claim_number, claim_title, status, claim_date, due_date, claim_amount, paid_amount, notes, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    projectIds.length > 0
      ? untypedSupabase
          .from("project_variations")
          .select("id, project_id, variation_number, variation_title, status, total_variation_price, approved_at, notes, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    supabase
      .from("client_notes")
      .select("id, client_id, author_name, body, sort_order, created_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<ClientNoteRow[]>(),
  ]);

  const opportunityQuotes = (opportunityQuotesResult.error ? [] : (opportunityQuotesResult.data ?? [])) as OpportunityQuoteRow[];
  const claims = (claimsResult.error ? [] : (claimsResult.data ?? [])) as ClaimRow[];
  const variations = (variationsResult.error ? [] : (variationsResult.data ?? [])) as VariationRow[];
  const clientNotes = clientNotesResult.error ? [] : (clientNotesResult.data ?? []);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const noteEntries: ClientNoteEntry[] = clientNotes.map((note) => ({
    id: note.id,
    title: note.author_name.trim() || "Team member",
    body: note.body.trim(),
    at: note.created_at,
    href: `/app/leads-clients/clients/${client.id}/notes`,
    authorName: note.author_name.trim() || "Team member",
    sortOrder: note.sort_order,
  }));

  const timeline: TimelineEvent[] = [{ id: `client-created-${client.id}`, at: client.created_at, title: "Client profile created", detail: client.company_name?.trim() || client.name, href: null }];

  for (const project of projects) timeline.push({ id: `project-${project.id}`, at: project.created_at, title: "Job created", detail: project.name, href: `/app/projects/${project.slug}/dashboard` });
  for (const opportunity of opportunities) timeline.push({ id: `opportunity-${opportunity.id}`, at: opportunity.updated_at, title: "Opportunity updated", detail: `${opportunity.name} · ${opportunity.stage}`, href: `/app/leads-clients/opportunities/${opportunity.slug}` });
  for (const quote of opportunityQuotes) {
    const linkedOpportunity = opportunityById.get(quote.opportunity_id);
    timeline.push({ id: `opportunity-quote-${quote.id}`, at: quote.updated_at || quote.created_at, title: quote.status === "Sent" || quote.status === "Viewed" ? "Quote sent" : "Quote issued", detail: `${quote.quote_number} · ${quote.quote_title}`, href: linkedOpportunity ? `/app/leads-clients/opportunities/${linkedOpportunity.slug}/quote` : null });
  }
  for (const claim of claims) {
    const linkedProject = projectById.get(claim.project_id);
    timeline.push({ id: `claim-issued-${claim.id}`, at: claim.claim_date || claim.updated_at, title: "Invoice / claim issued", detail: `${claim.claim_number} · ${claim.claim_title}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null });
    if (toNumeric(claim.paid_amount) > 0) timeline.push({ id: `claim-paid-${claim.id}`, at: claim.updated_at, title: "Payment received", detail: `${claim.claim_number} · ${toMoney(toNumeric(claim.paid_amount))}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null });
  }
  for (const variation of variations) {
    if (!variation.approved_at) continue;
    const linkedProject = projectById.get(variation.project_id);
    timeline.push({ id: `variation-approved-${variation.id}`, at: variation.approved_at, title: "Variation approved", detail: `${variation.variation_number} · ${variation.variation_title}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/variations/${variation.id}` : null });
  }
  for (const note of noteEntries) timeline.push({ id: `note-${note.id}`, at: note.at, title: "Note added", detail: note.title, href: note.href });

  const timelineRows = timeline.sort((left, right) => right.at.localeCompare(left.at));
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");

  return {
    client,
    timelineRows,
    jobsInProgress,
    activeOpportunities,
  };
}

export async function getClientOverviewData(clientId: string) {
  const { member, client, projects, opportunities, supabase } = await getClientBaseData(clientId);
  const projectIds = projects.map((project) => project.id);
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);

  const untypedSupabase = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => Promise<UntypedResult<Record<string, unknown>>>;
        };
      };
    };
  };

  const [projectQuotesResult, opportunityQuotesResult, claimsResult, variationsResult, clientNotesResult] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("project_quotes")
          .select("project_id, status, total_quote_price")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
          .returns<Array<Pick<ProjectQuoteRow, "project_id" | "status" | "total_quote_price">>>()
      : Promise.resolve({ data: [] as Array<Pick<ProjectQuoteRow, "project_id" | "status" | "total_quote_price">>, error: null }),
    opportunityIds.length > 0
      ? untypedSupabase
          .from("opportunity_quotes")
          .select("id, opportunity_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("opportunity_id", opportunityIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    projectIds.length > 0
      ? untypedSupabase
          .from("project_claims")
          .select("id, project_id, claim_number, claim_title, status, claim_date, due_date, claim_amount, paid_amount, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    projectIds.length > 0
      ? untypedSupabase
          .from("project_variations")
          .select("id, project_id, status, approved_at, variation_number, variation_title")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    supabase
      .from("client_notes")
      .select("id, author_name, created_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .returns<Array<Pick<ClientNoteRow, "id" | "author_name" | "created_at">>>(),
  ]);

  const projectQuotes = projectQuotesResult.error ? [] : (projectQuotesResult.data ?? []);
  const opportunityQuotes = (opportunityQuotesResult.error ? [] : (opportunityQuotesResult.data ?? [])) as OpportunityQuoteRow[];
  const claims = (claimsResult.error ? [] : (claimsResult.data ?? [])) as ClaimRow[];
  const variations = (variationsResult.error ? [] : (variationsResult.data ?? [])) as Array<
    Pick<VariationRow, "id" | "project_id" | "status" | "approved_at" | "variation_number" | "variation_title">
  >;
  const clientNotes = clientNotesResult.error ? [] : (clientNotesResult.data ?? []);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));

  const totalRevenue = claims.reduce((sum, claim) => sum + toNumeric(claim.paid_amount), 0);
  const totalClaimed = claims.reduce((sum, claim) => sum + toNumeric(claim.claim_amount), 0);
  const outstanding = Math.max(0, totalClaimed - totalRevenue);
  const latestJobDate = projects.reduce<string | null>((latest, project) => (!latest || project.updated_at > latest ? project.updated_at : latest), null);
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;

  const paidClaims = claims.filter((claim) => {
    const paidAmount = toNumeric(claim.paid_amount);
    const claimAmount = toNumeric(claim.claim_amount);
    const status = (claim.status ?? "").toLowerCase();
    return status === "paid" || paidAmount >= claimAmount;
  });

  const daySamples = paidClaims.map((claim) => dayDiff(claim.claim_date, claim.updated_at)).filter((value): value is number => value !== null);
  const avgDaysToPay = daySamples.length > 0 ? daySamples.reduce((sum, value) => sum + value, 0) / daySamples.length : null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueClaims = claims.filter((claim) => {
    const dueDate = claim.due_date;
    const claimAmount = toNumeric(claim.claim_amount);
    const paidAmount = toNumeric(claim.paid_amount);
    const balance = Math.max(0, claimAmount - paidAmount);
    const status = (claim.status ?? "").toLowerCase();
    return status === "overdue" || Boolean(dueDate && dueDate < todayIso && balance > 0);
  });
  const overdueAmount = overdueClaims.reduce((sum, claim) => sum + Math.max(0, toNumeric(claim.claim_amount) - toNumeric(claim.paid_amount)), 0);
  const paymentReliability = claims.length > 0 ? (paidClaims.length / claims.length) * 100 : null;
  const repeatJobs = Math.max(0, projects.length - 1);
  const repeatJobsPercent = projects.length > 0 ? (repeatJobs / projects.length) * 100 : 0;
  const openQuotesValue = [...projectQuotes, ...opportunityQuotes]
    .filter((quote) => isOpenQuote(quote.status))
    .reduce((sum, quote) => sum + toNumeric(quote.total_quote_price), 0);
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");
  const activeOpportunitiesValue = activeOpportunities.reduce((sum, opportunity) => sum + toNumeric(opportunity.estimated_value), 0);
  const forecastRevenue = openQuotesValue + activeOpportunitiesValue;

  const now = new Date();
  const last90Start = new Date(now);
  last90Start.setDate(last90Start.getDate() - 90);
  const previous90Start = new Date(last90Start);
  previous90Start.setDate(previous90Start.getDate() - 90);

  let revenueLast90 = 0;
  let revenuePrevious90 = 0;
  for (const claim of claims) {
    const paidAmount = toNumeric(claim.paid_amount);
    if (paidAmount <= 0 || !claim.updated_at) continue;
    const paidAt = toDate(claim.updated_at);
    if (!paidAt) continue;
    if (paidAt >= last90Start) revenueLast90 += paidAmount;
    else if (paidAt >= previous90Start && paidAt < last90Start) revenuePrevious90 += paidAmount;
  }

  const spendDeclinePercent = revenuePrevious90 > 0 ? ((revenuePrevious90 - revenueLast90) / revenuePrevious90) * 100 : revenueLast90 === 0 ? 0 : -100;
  const rejectedVariationCount = variations.filter((variation) => variation.status === "Rejected").length;

  const riskFlags: Array<{ tone: RiskTone; label: string; detail: string }> = [];
  if (overdueAmount > 0) riskFlags.push({ tone: "red", label: "Overdue invoices", detail: `${overdueClaims.length} overdue, ${toMoney(overdueAmount)} outstanding` });
  if (rejectedVariationCount > 0) riskFlags.push({ tone: "orange", label: "Dispute signal", detail: `${rejectedVariationCount} rejected variation${rejectedVariationCount === 1 ? "" : "s"}` });
  if (spendDeclinePercent >= 25 && revenuePrevious90 > 0) riskFlags.push({ tone: spendDeclinePercent >= 50 ? "red" : "orange", label: "Declining spend", detail: `${toPercent(spendDeclinePercent)} down vs prior 90 days` });
  if (avgDaysToPay !== null && avgDaysToPay > 45) riskFlags.push({ tone: "orange", label: "Slow payment behavior", detail: `${Math.round(avgDaysToPay)} days average to pay` });
  if (riskFlags.length === 0) riskFlags.push({ tone: "green", label: "Healthy profile", detail: "No immediate risk indicators found" });

  const noteTimelineEntries = clientNotes.map((note) => ({
    id: `note-${note.id}`,
    at: note.created_at,
    title: "Note added",
    detail: note.author_name.trim() || "Team member",
    href: `/app/leads-clients/clients/${client.id}/notes` as string | null,
  }));

  const timeline: TimelineEvent[] = [{ id: `client-created-${client.id}`, at: client.created_at, title: "Client profile created", detail: client.company_name?.trim() || client.name, href: null }];

  for (const project of projects) timeline.push({ id: `project-${project.id}`, at: project.created_at, title: "Job created", detail: project.name, href: `/app/projects/${project.slug}/dashboard` });
  for (const opportunity of opportunities) timeline.push({ id: `opportunity-${opportunity.id}`, at: opportunity.updated_at, title: "Opportunity updated", detail: `${opportunity.name} · ${opportunity.stage}`, href: `/app/leads-clients/opportunities/${opportunity.slug}` });
  for (const quote of opportunityQuotes) {
    const linkedOpportunity = opportunityById.get(quote.opportunity_id);
    timeline.push({ id: `opportunity-quote-${quote.id}`, at: quote.updated_at || quote.created_at, title: quote.status === "Sent" || quote.status === "Viewed" ? "Quote sent" : "Quote issued", detail: `${quote.quote_number} · ${quote.quote_title}`, href: linkedOpportunity ? `/app/leads-clients/opportunities/${linkedOpportunity.slug}/quote` : null });
  }
  for (const claim of claims) {
    const linkedProject = projectById.get(claim.project_id);
    timeline.push({ id: `claim-issued-${claim.id}`, at: claim.claim_date || claim.updated_at, title: "Invoice / claim issued", detail: `${claim.claim_number} · ${claim.claim_title}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null });
    if (toNumeric(claim.paid_amount) > 0) timeline.push({ id: `claim-paid-${claim.id}`, at: claim.updated_at, title: "Payment received", detail: `${claim.claim_number} · ${toMoney(toNumeric(claim.paid_amount))}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null });
  }
  for (const variation of variations) {
    if (!variation.approved_at) continue;
    const linkedProject = projectById.get(variation.project_id);
    timeline.push({ id: `variation-approved-${variation.id}`, at: variation.approved_at, title: "Variation approved", detail: `${variation.variation_number} · ${variation.variation_title}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/variations/${variation.id}` : null });
  }
  timeline.push(...noteTimelineEntries);

  const timelineRows = timeline.sort((left, right) => right.at.localeCompare(left.at)).slice(0, 4);
  const closedOpportunities = opportunities.filter((opportunity) => opportunity.stage === "Won" || opportunity.stage === "Lost");
  const wonOpportunities = opportunities.filter((opportunity) => opportunity.stage === "Won");
  const conversionRate = closedOpportunities.length > 0 ? (wonOpportunities.length / closedOpportunities.length) * 100 : null;

  return {
    client,
    projects,
    totalRevenue,
    outstanding,
    latestJobDate,
    jobsInProgress,
    avgDaysToPay,
    paymentReliability,
    repeatJobsPercent,
    openQuotesValue,
    forecastRevenue,
    riskFlags,
    timelineRows,
    activeOpportunities,
    conversionRate,
  };
}

export async function getClientDetailData(clientId: string, options?: ClientDetailDataOptions) {
  const { member, supabase, client, projects, opportunities } = await getClientBaseData(clientId);
  const includeDrawingSets = options?.includeDrawingSets ?? false;
  const projectIds = projects.map((project) => project.id);
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  const projectIdSet = new Set(projectIds);
  const opportunityIdSet = new Set(opportunityIds);

  const untypedSupabase = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => Promise<UntypedResult<Record<string, unknown>>>;
        };
      };
    };
  };

  const [projectQuotesResult, opportunityQuotesRawResult, claimsRawResult, variationsRawResult, filesRawResult, clientNotesResult] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("project_quotes")
          .select("id, project_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
          .returns<ProjectQuoteRow[]>()
      : Promise.resolve({ data: [] as ProjectQuoteRow[], error: null }),
    opportunityIds.length > 0
      ? untypedSupabase
          .from("opportunity_quotes")
          .select("id, opportunity_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("opportunity_id", opportunityIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    projectIds.length > 0
      ? untypedSupabase
          .from("project_claims")
          .select("id, project_id, claim_number, claim_title, status, claim_date, due_date, claim_amount, paid_amount, notes, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    projectIds.length > 0
      ? untypedSupabase
          .from("project_variations")
          .select("id, project_id, variation_number, variation_title, status, total_variation_price, approved_at, notes, created_at, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    includeDrawingSets && projectIds.length > 0
      ? untypedSupabase
          .from("project_drawing_sets")
          .select("id, project_id, file_name, storage_path, file_size_bytes, created_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    supabase
      .from("client_notes")
      .select("id, client_id, author_name, body, sort_order, created_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<ClientNoteRow[]>(),
  ]);

  const projectQuotes = (projectQuotesResult.error ? [] : (projectQuotesResult.data ?? [])).filter((quote) => projectIdSet.has(quote.project_id));
  const opportunityQuotes = ((opportunityQuotesRawResult.error ? [] : (opportunityQuotesRawResult.data ?? [])) as OpportunityQuoteRow[]).filter((quote) => opportunityIdSet.has(quote.opportunity_id));
  const claims = ((claimsRawResult.error ? [] : (claimsRawResult.data ?? [])) as ClaimRow[]).filter((claim) => projectIdSet.has(claim.project_id));
  const variations = ((variationsRawResult.error ? [] : (variationsRawResult.data ?? [])) as VariationRow[]).filter((variation) => projectIdSet.has(variation.project_id));
  const drawingSets = ((filesRawResult.error ? [] : (filesRawResult.data ?? [])) as DrawingSetRow[]).filter((file) => projectIdSet.has(file.project_id));
  const clientNotes = clientNotesResult.error ? [] : (clientNotesResult.data ?? []);
  const drawingSetsWithDownloads = includeDrawingSets
    ? await Promise.all(
        drawingSets.map(async (file) => {
          const signed = await supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).createSignedUrl(file.storage_path, 60 * 60);
          return {
            ...file,
            download_url: signed.error ? null : signed.data.signedUrl,
          };
        })
      )
    : [];

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));

  const totalRevenue = claims.reduce((sum, claim) => sum + toNumeric(claim.paid_amount), 0);
  const totalClaimed = claims.reduce((sum, claim) => sum + toNumeric(claim.claim_amount), 0);
  const outstanding = Math.max(0, totalClaimed - totalRevenue);
  const latestJobDate = projects.reduce<string | null>((latest, project) => (!latest || project.updated_at > latest ? project.updated_at : latest), null);
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;

  const paidClaims = claims.filter((claim) => {
    const paidAmount = toNumeric(claim.paid_amount);
    const claimAmount = toNumeric(claim.claim_amount);
    const status = (claim.status ?? "").toLowerCase();
    return status === "paid" || paidAmount >= claimAmount;
  });

  const daySamples = paidClaims.map((claim) => dayDiff(claim.claim_date, claim.updated_at)).filter((value): value is number => value !== null);
  const avgDaysToPay = daySamples.length > 0 ? daySamples.reduce((sum, value) => sum + value, 0) / daySamples.length : null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueClaims = claims.filter((claim) => {
    const dueDate = claim.due_date;
    const claimAmount = toNumeric(claim.claim_amount);
    const paidAmount = toNumeric(claim.paid_amount);
    const balance = Math.max(0, claimAmount - paidAmount);
    const status = (claim.status ?? "").toLowerCase();
    return status === "overdue" || Boolean(dueDate && dueDate < todayIso && balance > 0);
  });
  const overdueAmount = overdueClaims.reduce((sum, claim) => sum + Math.max(0, toNumeric(claim.claim_amount) - toNumeric(claim.paid_amount)), 0);
  const paymentReliability = claims.length > 0 ? (paidClaims.length / claims.length) * 100 : null;
  const repeatJobs = Math.max(0, projects.length - 1);
  const repeatJobsPercent = projects.length > 0 ? (repeatJobs / projects.length) * 100 : 0;
  const openQuotesValue = [...projectQuotes, ...opportunityQuotes].filter((quote) => isOpenQuote(quote.status)).reduce((sum, quote) => sum + toNumeric(quote.total_quote_price), 0);
  const activeOpportunitiesValue = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost").reduce((sum, opportunity) => sum + toNumeric(opportunity.estimated_value), 0);
  const forecastRevenue = openQuotesValue + activeOpportunitiesValue;

  const now = new Date();
  const last90Start = new Date(now);
  last90Start.setDate(last90Start.getDate() - 90);
  const previous90Start = new Date(last90Start);
  previous90Start.setDate(previous90Start.getDate() - 90);

  let revenueLast90 = 0;
  let revenuePrevious90 = 0;
  for (const claim of claims) {
    const paidAmount = toNumeric(claim.paid_amount);
    if (paidAmount <= 0 || !claim.updated_at) continue;
    const paidAt = toDate(claim.updated_at);
    if (!paidAt) continue;
    if (paidAt >= last90Start) revenueLast90 += paidAmount;
    else if (paidAt >= previous90Start && paidAt < last90Start) revenuePrevious90 += paidAmount;
  }

  const spendDeclinePercent = revenuePrevious90 > 0 ? ((revenuePrevious90 - revenueLast90) / revenuePrevious90) * 100 : revenueLast90 === 0 ? 0 : -100;
  const rejectedVariationCount = variations.filter((variation) => variation.status === "Rejected").length;

  const riskFlags: Array<{ tone: RiskTone; label: string; detail: string }> = [];
  if (overdueAmount > 0) riskFlags.push({ tone: "red", label: "Overdue invoices", detail: `${overdueClaims.length} overdue, ${toMoney(overdueAmount)} outstanding` });
  if (rejectedVariationCount > 0) riskFlags.push({ tone: "orange", label: "Dispute signal", detail: `${rejectedVariationCount} rejected variation${rejectedVariationCount === 1 ? "" : "s"}` });
  if (spendDeclinePercent >= 25 && revenuePrevious90 > 0) riskFlags.push({ tone: spendDeclinePercent >= 50 ? "red" : "orange", label: "Declining spend", detail: `${toPercent(spendDeclinePercent)} down vs prior 90 days` });
  if (avgDaysToPay !== null && avgDaysToPay > 45) riskFlags.push({ tone: "orange", label: "Slow payment behavior", detail: `${Math.round(avgDaysToPay)} days average to pay` });
  if (riskFlags.length === 0) riskFlags.push({ tone: "green", label: "Healthy profile", detail: "No immediate risk indicators found" });

  const noteEntries: ClientNoteEntry[] = clientNotes.map((note) => ({
    id: note.id,
    title: note.author_name.trim() || "Team member",
    body: note.body.trim(),
    at: note.created_at,
    href: `/app/leads-clients/clients/${client.id}/notes`,
    authorName: note.author_name.trim() || "Team member",
    sortOrder: note.sort_order,
  }));

  const timeline: TimelineEvent[] = [{ id: `client-created-${client.id}`, at: client.created_at, title: "Client profile created", detail: client.company_name?.trim() || client.name, href: null }];

  for (const project of projects) timeline.push({ id: `project-${project.id}`, at: project.created_at, title: "Job created", detail: project.name, href: `/app/projects/${project.slug}/dashboard` });
  for (const opportunity of opportunities) timeline.push({ id: `opportunity-${opportunity.id}`, at: opportunity.updated_at, title: "Opportunity updated", detail: `${opportunity.name} · ${opportunity.stage}`, href: `/app/leads-clients/opportunities/${opportunity.slug}` });
  for (const quote of opportunityQuotes) {
    const linkedOpportunity = opportunityById.get(quote.opportunity_id);
    timeline.push({ id: `opportunity-quote-${quote.id}`, at: quote.updated_at || quote.created_at, title: quote.status === "Sent" || quote.status === "Viewed" ? "Quote sent" : "Quote issued", detail: `${quote.quote_number} · ${quote.quote_title}`, href: linkedOpportunity ? `/app/leads-clients/opportunities/${linkedOpportunity.slug}/quote` : null });
  }
  for (const claim of claims) {
    const linkedProject = projectById.get(claim.project_id);
    timeline.push({ id: `claim-issued-${claim.id}`, at: claim.claim_date || claim.updated_at, title: "Invoice / claim issued", detail: `${claim.claim_number} · ${claim.claim_title}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null });
    if (toNumeric(claim.paid_amount) > 0) timeline.push({ id: `claim-paid-${claim.id}`, at: claim.updated_at, title: "Payment received", detail: `${claim.claim_number} · ${toMoney(toNumeric(claim.paid_amount))}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null });
  }
  for (const variation of variations) {
    if (!variation.approved_at) continue;
    const linkedProject = projectById.get(variation.project_id);
    timeline.push({ id: `variation-approved-${variation.id}`, at: variation.approved_at, title: "Variation approved", detail: `${variation.variation_number} · ${variation.variation_title}`, href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/variations/${variation.id}` : null });
  }
  for (const note of noteEntries) timeline.push({ id: `note-${note.id}`, at: note.at, title: "Note added", detail: note.title, href: note.href });

  const timelineRows = timeline.sort((left, right) => right.at.localeCompare(left.at));
  const recentClaims = [...claims].sort((left, right) => (right.due_date || right.updated_at).localeCompare(left.due_date || left.updated_at));
  const recentQuotes = [...projectQuotes, ...opportunityQuotes].sort((left, right) => (right.updated_at || right.created_at).localeCompare(left.updated_at || left.created_at));
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost");
  const closedOpportunities = opportunities.filter((opportunity) => opportunity.stage === "Won" || opportunity.stage === "Lost");
  const wonOpportunities = opportunities.filter((opportunity) => opportunity.stage === "Won");
  const conversionRate = closedOpportunities.length > 0 ? (wonOpportunities.length / closedOpportunities.length) * 100 : null;

  return {
    client,
    projects,
    opportunities,
    projectQuotes,
    opportunityQuotes,
    claims,
    variations,
    drawingSets: drawingSetsWithDownloads,
    projectById,
    opportunityById,
    totalRevenue,
    outstanding,
    latestJobDate,
    jobsInProgress,
    avgDaysToPay,
    overdueAmount,
    paymentReliability,
    repeatJobsPercent,
    openQuotesValue,
    forecastRevenue,
    riskFlags,
    noteEntries,
    timelineRows,
    recentClaims,
    recentQuotes,
    activeOpportunities,
    conversionRate,
  };
}
