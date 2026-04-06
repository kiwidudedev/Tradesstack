"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const sidebarProjectSelect = "id, name, slug, created_at";
const SIDEBAR_PROJECT_LIMIT = 40;

export interface SidebarProject {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

const projectsByOrganizationCache = new Map<string, SidebarProject[]>();

export function useOrganizationProjects() {
  const { session, isLoading: isAuthLoading } = useAuth();
  const organizationId = session?.organizationId ?? null;
  const hasCachedProjects = organizationId ? projectsByOrganizationCache.has(organizationId) : false;
  const cachedProjects = organizationId ? projectsByOrganizationCache.get(organizationId) ?? [] : [];
  const [projects, setProjects] = useState<SidebarProject[]>(cachedProjects);
  const [isLoading, setIsLoading] = useState(organizationId ? !hasCachedProjects : false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!supabase || !organizationId) {
      setProjects([]);
      setIsLoading(false);
      return;
    }

    const hasCached = projectsByOrganizationCache.has(organizationId);
    const cached = projectsByOrganizationCache.get(organizationId) ?? [];
    const shouldUseCache = !options?.force && hasCached;
    if (shouldUseCache) {
      setProjects(cached);
      setIsLoading(false);
      return;
    }

    if (!options?.silent) {
      setIsLoading(true);
    }

    const projectsResult = await supabase
      .from("organization_projects")
      .select(sidebarProjectSelect)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(SIDEBAR_PROJECT_LIMIT);

    const projectRows = (projectsResult.data ?? []) as SidebarProject[];
    const projectIds = projectRows.map((project) => project.id);
    const hiddenWorkspaceScopedResult =
      projectIds.length > 0
        ? await supabase
            .from("organization_opportunities")
            .select("workspace_project_id")
            .eq("organization_id", organizationId)
            .in("workspace_project_id", projectIds)
        : { data: [], error: null };

    const hiddenWorkspaceProjectIds = new Set(
      (hiddenWorkspaceScopedResult.data ?? [])
        .map((row) => row.workspace_project_id)
        .filter((value): value is string => Boolean(value))
    );
    const nextProjects = projectRows.filter(
      (project) => !hiddenWorkspaceProjectIds.has(project.id)
    );
    projectsByOrganizationCache.set(organizationId, nextProjects);
    setProjects(nextProjects);
    setIsLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void refresh({ silent: true });
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isAuthLoading, refresh]);

  return {
    projects,
    isLoading,
    refresh,
  };
}
