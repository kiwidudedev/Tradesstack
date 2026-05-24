"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import type { AuthSession, UserRole } from "@/lib/types";

interface LoginResult {
  error: string | null;
  redirectPath?: string | null;
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
  inviteToken?: string;
};

type MemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type OrganizationRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "logo_path" | "created_by" | "created_at" | "updated_at"
>;

type AuthStoreState = {
  session: AuthSession | null;
  isLoading: boolean;
};

const MISSING_ENV_ERROR =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

const listeners = new Set<() => void>();
let authStore: AuthStoreState = {
  session: null,
  isLoading: true,
};

let browserSupabase: ReturnType<typeof createBrowserSupabaseClient> | null | undefined;
let refreshInFlight: Promise<void> | null = null;
let authSubscriptionAttached = false;

function getSupabaseClient() {
  if (browserSupabase !== undefined) {
    return browserSupabase;
  }

  try {
    browserSupabase = createBrowserSupabaseClient();
  } catch {
    browserSupabase = null;
  }

  return browserSupabase;
}

function emitStoreUpdate() {
  listeners.forEach((listener) => listener());
}

function updateStore(next: Partial<AuthStoreState>) {
  const nextSession = next.session === undefined ? authStore.session : next.session;
  const nextIsLoading = next.isLoading === undefined ? authStore.isLoading : next.isLoading;

  if (nextSession === authStore.session && nextIsLoading === authStore.isLoading) {
    return;
  }

  authStore = {
    session: nextSession,
    isLoading: nextIsLoading,
  };

  emitStoreUpdate();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return authStore;
}

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

  if (message.includes("password should contain at least one character of each")) {
    return "Password must include uppercase and lowercase letters, a number, and a symbol.";
  }

  return error.message;
}

function isUserRole(value: unknown): value is UserRole {
  return value === "owner" || value === "admin" || value === "qs" || value === "project_manager" || value === "worker";
}

function resolveRole(user: User, member: MemberRow | null): UserRole {
  if (member?.role && isUserRole(member.role)) {
    return member.role;
  }

  if (isUserRole(user.user_metadata?.role)) {
    return user.user_metadata.role;
  }

  return "worker";
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

async function isPlatformAdminUser() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase.rpc("is_platform_admin" as never);
  if (error) {
    return false;
  }

  return Boolean(data);
}

async function refreshAuthSession() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    updateStore({ session: null, isLoading: false });
    return;
  }

  updateStore({ isLoading: true });

  refreshInFlight = (async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        updateStore({ session: null, isLoading: false });
        return;
      }

      const { data: member } = await supabase
        .from("organization_members")
        .select("id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const resolvedMember = member ?? null;
      let organization: OrganizationRow | null = null;

      if (!resolvedMember) {
        const platformAdmin = await isPlatformAdminUser();
        if (!platformAdmin) {
          // Tenant safety: never auto-provision org membership during session refresh.
          // Missing membership means this user is not fully provisioned for app access.
          updateStore({ session: null, isLoading: false });
          return;
        }
      }

      if (resolvedMember?.organization_id && !organization) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name, logo_path, created_by, created_at, updated_at")
          .eq("id", resolvedMember.organization_id)
          .maybeSingle();

        organization = org ?? null;
      }

      updateStore({
        session: mapToAuthSession(user, resolvedMember, organization),
        isLoading: false,
      });
    } catch {
      updateStore({ session: null, isLoading: false });
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function ensureAuthSubscription() {
  if (authSubscriptionAttached) {
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    updateStore({ session: null, isLoading: false });
    return;
  }

  authSubscriptionAttached = true;
  void refreshAuthSession();

  supabase.auth.onAuthStateChange(() => {
    void refreshAuthSession();
  });
}

export function useAuth() {
  const { session, isLoading } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    ensureAuthSubscription();
  }, []);

  const refresh = useCallback(async () => {
    await refreshAuthSession();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { error: MISSING_ENV_ERROR };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: toAuthMessage(error, "Unable to sign in right now."), redirectPath: null };
    }

    const userId = data.user?.id;
    if (!userId) {
      await supabase.auth.signOut();
      return { error: "Unable to sign in right now.", redirectPath: null };
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      const { data: platformAdmin, error: platformAdminError } = await supabase.rpc("is_platform_admin" as never);

      if (platformAdminError || !platformAdmin) {
        await supabase.auth.signOut();
        return {
          error:
            "No workspace found for this account. Finish sign up or ask your admin for an invite.",
          redirectPath: null,
        };
      }

      await refreshAuthSession();
      return { error: null, redirectPath: "/app/internal/intelligence" };
    }

    await refreshAuthSession();
    return { error: null, redirectPath: null };
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<RegisterResult> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        error: MISSING_ENV_ERROR,
        requiresEmailConfirmation: false,
      };
    }

    const fullName = input.fullName.trim();
    const organizationName = input.organizationName.trim();
    const inviteToken = (input.inviteToken ?? "").trim();

    if (!fullName || (!organizationName && !inviteToken)) {
      return {
        error: "Full name is required, plus organization name or invite token.",
        requiresEmailConfirmation: false,
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: fullName,
          organization_name: organizationName || undefined,
          invite_token: inviteToken || undefined,
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
      await refreshAuthSession();
    }

    return {
      error: null,
      requiresEmailConfirmation,
    };
  }, []);

  const logout = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      updateStore({ session: null, isLoading: false });
      return;
    }

    await supabase.auth.signOut();
    updateStore({ session: null, isLoading: false });
  }, []);

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
