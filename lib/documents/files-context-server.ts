import "server-only";

import { createHash } from "node:crypto";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getDocumentFilesPageMetadata,
  getOpportunityDocumentWorkspace,
  getOrCreateProjectDocumentWorkspace,
  resolveOpportunityDocumentWorkspace,
  resolveOpportunityFilesProject,
  resolveProjectDocumentWorkspace,
} from "@/lib/documents/workspace-server";
import type {
  DocumentEntityContext,
  DocumentFilesPageMetadata,
} from "@/lib/documents/workspace";
import type { Database } from "@/lib/supabase/types";

const FILES_CONTEXT_TTL_MS = 15_000;
const FILES_CONTEXT_MAX_ENTRIES = 256;

export interface ServerFilesContext {
  organizationId: string;
  entity: DocumentEntityContext;
  workspaceId: string;
  metadata: DocumentFilesPageMetadata;
  finalProject: { id: string; slug: string } | null;
}

interface CacheEntry {
  context: ServerFilesContext;
  expiresAt: number;
}

type FilesContextLoader<T> = (params: {
  client: SupabaseClient<Database>;
  workspaceId: string;
}) => Promise<T>;

export interface ServerFilesEntry<T> {
  context: ServerFilesContext;
  data: T;
}

const globalFilesContext = globalThis as typeof globalThis & {
  __tradesStackFilesContextCache?: Map<string, CacheEntry>;
};
const filesContextCache = globalFilesContext.__tradesStackFilesContextCache
  ?? new Map<string, CacheEntry>();
globalFilesContext.__tradesStackFilesContextCache = filesContextCache;

function pruneCache(now: number) {
  for (const [key, entry] of filesContextCache) {
    if (entry.expiresAt <= now) filesContextCache.delete(key);
  }
  while (filesContextCache.size >= FILES_CONTEXT_MAX_ENTRIES) {
    const oldestKey = filesContextCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    filesContextCache.delete(oldestKey);
  }
}

async function requestCacheScope(kind: "project" | "opportunity", slug: string) {
  const requestHeaders = await headers();
  const isRscNavigation = requestHeaders.get("rsc") === "1"
    || requestHeaders.get("next-router-state-tree") !== null
    || requestHeaders.get("next-router-prefetch") !== null
    || requestHeaders.get("sec-fetch-dest") === "empty";
  const cookieFingerprint = createHash("sha256")
    .update(requestHeaders.get("cookie") ?? "anonymous")
    .digest("base64url");
  return {
    isRscNavigation,
    key: `${kind}:${slug}:${cookieFingerprint}`,
  };
}

function readReusableContext(key: string, isRscNavigation: boolean) {
  if (!isRscNavigation) return null;
  const now = Date.now();
  const entry = filesContextCache.get(key);
  if (!entry || entry.expiresAt <= now) {
    if (entry) filesContextCache.delete(key);
    return null;
  }
  return entry.context;
}

function storeContext(key: string, context: ServerFilesContext) {
  const now = Date.now();
  pruneCache(now);
  filesContextCache.delete(key);
  filesContextCache.set(key, { context, expiresAt: now + FILES_CONTEXT_TTL_MS });
}

function logContext(
  kind: "project" | "opportunity",
  reused: boolean,
  scope: { isRscNavigation: boolean; key: string },
) {
  if (process.env.FILES_CONTEXT_TIMING === "1") {
    console.info("[files/context]", {
      kind,
      reused,
      rsc: scope.isRscNavigation,
      key: scope.key.slice(-10),
      entries: filesContextCache.size,
    });
  }
}

async function loadProjectFilesEntry<T>(
  projectSlug: string,
  loader?: FilesContextLoader<T>,
): Promise<ServerFilesEntry<T | undefined> | null> {
  const scope = await requestCacheScope("project", projectSlug);
  const reused = readReusableContext(scope.key, scope.isRscNavigation);
  if (reused) {
    logContext("project", true, scope);
    const client = loader ? await createServerSupabaseClient() : null;
    return {
      context: reused,
      data: loader && client
        ? await loader({ client, workspaceId: reused.workspaceId })
        : undefined,
    };
  }

  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
  if (!project) return null;
  const supabase = await createServerSupabaseClient();
  const workspaceId = await resolveProjectDocumentWorkspace(supabase, project.id)
    .then((existing) => existing ?? getOrCreateProjectDocumentWorkspace(supabase, project.id));
  const [metadata, data] = await Promise.all([
    getDocumentFilesPageMetadata(supabase, workspaceId),
    loader ? loader({ client: supabase, workspaceId }) : Promise.resolve(undefined),
  ]);
  const context: ServerFilesContext = {
    organizationId: project.organization_id,
    entity: { kind: "project", id: project.id, slug: project.slug },
    workspaceId,
    metadata,
    finalProject: null,
  };
  storeContext(scope.key, context);
  logContext("project", false, scope);
  return { context, data };
}

export const getProjectFilesContext = cache(async (
  projectSlug: string,
): Promise<ServerFilesContext | null> => (
  await loadProjectFilesEntry(projectSlug)
)?.context ?? null);

export async function getProjectFilesEntry<T>(
  projectSlug: string,
  loader: FilesContextLoader<T>,
): Promise<ServerFilesEntry<T> | null> {
  return loadProjectFilesEntry(projectSlug, loader) as Promise<ServerFilesEntry<T> | null>;
}

async function loadOpportunityFilesEntry<T>(
  opportunitySlug: string,
  loader?: FilesContextLoader<T>,
): Promise<ServerFilesEntry<T | undefined> | null> {
  const scope = await requestCacheScope("opportunity", opportunitySlug);
  const reused = readReusableContext(scope.key, scope.isRscNavigation);
  if (reused) {
    // Conversion can happen while an Opportunity Files tab is open. Keep this
    // authoritative check on every RSC navigation so Won Opportunities redirect
    // immediately rather than exposing a cached editable surface.
    const supabase = await createServerSupabaseClient();
    const finalProject = await resolveOpportunityFilesProject(supabase, {
      organizationId: reused.organizationId,
      opportunityId: reused.entity.id,
    });
    logContext("opportunity", true, scope);
    const context = { ...reused, finalProject };
    return {
      context,
      data: !finalProject && loader
        ? await loader({ client: supabase, workspaceId: reused.workspaceId })
        : undefined,
    };
  }

  const opportunity = await getOpportunityWorkspaceData(opportunitySlug);
  if (!opportunity) return null;
  const supabase = await createServerSupabaseClient();
  const finalProject = await resolveOpportunityFilesProject(supabase, {
    organizationId: opportunity.organizationId,
    opportunityId: opportunity.opportunityId,
  });
  const workspaceId = finalProject
    ? ""
    : await resolveOpportunityDocumentWorkspace(supabase, opportunity.opportunityId)
      .then((existing) => existing ?? getOpportunityDocumentWorkspace(supabase, opportunity.opportunityId));
  const [metadata, data] = finalProject
    ? [{ canView: false, canWrite: false, canDelete: false, canPurge: false, cleanupAttentionRequired: false }, undefined] as const
    : await Promise.all([
        getDocumentFilesPageMetadata(supabase, workspaceId),
        loader ? loader({ client: supabase, workspaceId }) : Promise.resolve(undefined),
      ]);
  const context: ServerFilesContext = {
    organizationId: opportunity.organizationId,
    entity: { kind: "opportunity", id: opportunity.opportunityId, slug: opportunity.slug },
    workspaceId,
    metadata,
    finalProject,
  };
  storeContext(scope.key, context);
  logContext("opportunity", false, scope);
  return { context, data };
}

export const getOpportunityFilesContext = cache(async (
  opportunitySlug: string,
): Promise<ServerFilesContext | null> => (
  await loadOpportunityFilesEntry(opportunitySlug)
)?.context ?? null);

export async function getOpportunityFilesEntry<T>(
  opportunitySlug: string,
  loader: FilesContextLoader<T>,
): Promise<ServerFilesEntry<T> | null> {
  return loadOpportunityFilesEntry(opportunitySlug, loader) as Promise<ServerFilesEntry<T> | null>;
}

export function clearFilesContextCacheForTests() {
  filesContextCache.clear();
}
