"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import type { AuthSession, UserRole } from "@/lib/types";

interface LoginResult {
  error: string | null;
}

interface RegisterResult {
  error: string | null;
  requiresEmailConfirmation: boolean;
}

type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
};

type MemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];

const MISSING_ENV_ERROR =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

function toAuthMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (message.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }

  if (message.includes("already registered")) {
    return "This email is already registered. Please sign in instead.";
  }

  return error.message;
}

function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "member";
}

function resolveRole(user: User, member: MemberRow | null): UserRole {
  if (member?.role && isUserRole(member.role)) {
    return member.role;
  }

  if (isUserRole(user.user_metadata?.role)) {
    return user.user_metadata.role;
  }

  return "member";
}

function resolveName(user: User, member: MemberRow | null): string {
  if (member?.display_name) {
    return member.display_name;
  }

  const metadataName = user.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName;
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "TradesStack User";
}

function resolveOrganizationName(user: User, organization: OrganizationRow | null): string | null {
  if (organization?.name) {
    return organization.name;
  }

  const metadataOrgName = user.user_metadata?.organization_name;
  if (typeof metadataOrgName === "string" && metadataOrgName.trim()) {
    return metadataOrgName;
  }

  return null;
}

function mapToAuthSession(user: User, member: MemberRow | null, organization: OrganizationRow | null): AuthSession {
  return {
    id: user.id,
    role: resolveRole(user, member),
    email: user.email ?? "",
    name: resolveName(user, member),
    organizationId: member?.organization_id ?? organization?.id ?? null,
    organizationName: resolveOrganizationName(user, organization),
    avatarPath: member?.avatar_path ?? null,
    avatarUrl: null,
  };
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setSession(null);
        return;
      }

      const { data: member } = await supabase
        .from("organization_members")
        .select("id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let resolvedMember = member ?? null;
      let organization: OrganizationRow | null = null;

      if (!resolvedMember) {
        const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");

        if (ensuredOrganizationId) {
          const { data: bootstrappedMember } = await supabase
            .from("organization_members")
            .select("id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          resolvedMember = bootstrappedMember ?? null;

          const { data: ensuredOrganization } = await supabase
            .from("organizations")
            .select("id, name, created_by, created_at, updated_at")
            .eq("id", ensuredOrganizationId)
            .maybeSingle();

          organization = ensuredOrganization ?? null;
        }
      }

      if (resolvedMember?.organization_id && !organization) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name, created_by, created_at, updated_at")
          .eq("id", resolvedMember.organization_id)
          .maybeSingle();

        organization = org ?? null;
      }

      setSession(mapToAuthSession(user, resolvedMember, organization));
    } catch {
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      if (!supabase) {
        return { error: MISSING_ENV_ERROR };
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: toAuthMessage(error, "Unable to sign in right now.") };
      }

      await refresh();
      return { error: null };
    },
    [refresh, supabase]
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<RegisterResult> => {
      if (!supabase) {
        return {
          error: MISSING_ENV_ERROR,
          requiresEmailConfirmation: false,
        };
      }

      const fullName = input.fullName.trim();
      const organizationName = input.organizationName.trim();

      if (!fullName || !organizationName) {
        return {
          error: "Full name and organization name are required.",
          requiresEmailConfirmation: false,
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            full_name: fullName,
            organization_name: organizationName,
          },
        },
      });

      if (error) {
        return {
          error: toAuthMessage(error, "Unable to create your account right now."),
          requiresEmailConfirmation: false,
        };
      }

      const requiresEmailConfirmation = !data.session;

      if (!requiresEmailConfirmation) {
        await refresh();
      }

      return {
        error: null,
        requiresEmailConfirmation,
      };
    },
    [refresh, supabase]
  );

  const logout = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    void refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  return {
    session,
    role: session?.role,
    isLoading,
    login,
    register,
    refresh,
    logout,
  };
}
