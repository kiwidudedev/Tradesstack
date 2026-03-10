"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { OrganizationProject } from "@/lib/projects";

const projectSelect =
  "id, organization_id, created_by, name, slug, stage, location, cover_image_url, created_at, updated_at";

export function useOrganizationProjects() {
  const { session, isLoading: isAuthLoading } = useAuth();
  const [projects, setProjects] = useState<OrganizationProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const organizationId = session?.organizationId ?? null;

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) {
      setProjects([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data } = await supabase
      .from("organization_projects")
      .select(projectSelect)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    setProjects(data ?? []);
    setIsLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isAuthLoading, refresh]);

  return {
    projects,
    isLoading: isLoading || isAuthLoading,
    refresh,
  };
}
