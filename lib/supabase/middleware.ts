import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

interface SessionUpdateResult {
  response: NextResponse;
  user: User | null;
  projectSlugRedirect: string | null;
}

export async function updateSession(request: NextRequest): Promise<SessionUpdateResult> {
  let response = NextResponse.next({
    request,
  });

  try {
    const { url, anonKey } = getSupabaseEnv();

    const supabase = createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let projectSlugRedirect: string | null = null;
    const projectRouteMatch = request.nextUrl.pathname.match(
      /^\/app\/projects\/([^/]+)(?:\/|$)/,
    );

    if (user && projectRouteMatch?.[1]) {
      const { data: member } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (member) {
        const aliasClient = supabase as unknown as {
          rpc: (
            name: "resolve_project_slug_alias_v1",
            args: { p_organization_id: string; p_alias_slug: string },
          ) => Promise<{
            data: Array<{ canonical_slug: string }> | null;
            error: unknown;
          }>;
        };
        const { data: aliases, error } = await aliasClient.rpc(
          "resolve_project_slug_alias_v1",
          {
            p_organization_id: member.organization_id,
            p_alias_slug: decodeURIComponent(projectRouteMatch[1]),
          },
        );

        if (!error) {
          projectSlugRedirect = aliases?.[0]?.canonical_slug ?? null;
        }
      }
    }

    return { response, user, projectSlugRedirect };
  } catch {
    return { response, user: null, projectSlugRedirect: null };
  }
}
