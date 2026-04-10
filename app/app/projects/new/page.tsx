"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { PROJECT_STAGE_OPTIONS } from "@/lib/projects";
import type { ProjectStage } from "@/lib/projects";
import {
  resolveUniqueTradePackWorkspaceSlug,
  toTradePackWorkspaceSlug,
} from "@/lib/trade-pack-workspaces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NEW_CLIENT_OPTION = "__new_client__";
type OrganizationClient = Database["public"]["Tables"]["organization_clients"]["Row"];

function toProjectCreationErrorMessage(message: string): string {
  if (message.includes("organization_projects_stage_check")) {
    return "Project stage values are out of sync in the database. Apply the latest Supabase migrations and try again.";
  }

  return message;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [name, setName] = useState("");
  const [stage, setStage] = useState<ProjectStage>("Pricing");
  const [location, setLocation] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [clients, setClients] = useState<OrganizationClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientContactName, setClientContactName] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const resolveOrganizationId = useCallback(async (): Promise<string | null> => {
    if (!session || !supabase) {
      return null;
    }

    if (session.organizationId) {
      return session.organizationId;
    }

    const { data: ensuredOrganizationId, error: ensureOrganizationError } = await supabase.rpc("ensure_organization_membership");

    if (!ensureOrganizationError && ensuredOrganizationId) {
      return ensuredOrganizationId;
    }

    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", session.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return memberRow?.organization_id ?? null;
  }, [session, supabase]);

  useEffect(() => {
    if (isAuthLoading || !session || !supabase) {
      return;
    }

    let isCancelled = false;

    const loadClients = async () => {
      setIsLoadingClients(true);

      try {
        const resolvedOrganizationId = await resolveOrganizationId();

        if (!resolvedOrganizationId) {
          if (!isCancelled) {
            setError("Could not find or create organization access for this account.");
          }
          return;
        }

        if (!isCancelled) {
          setOrganizationId(resolvedOrganizationId);
        }

        const { data: clientRows, error: clientsError } = await supabase
          .from("organization_clients")
          .select("id, organization_id, created_by, name, company_name, email, phone, created_at, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .order("company_name", { ascending: true });

        if (clientsError) {
          if (!isCancelled) {
            setError(clientsError.message);
          }
          return;
        }

        if (isCancelled) {
          return;
        }

        const resolvedClients = (clientRows ?? []).map((clientRow) => ({
          ...clientRow,
          tags: [],
        }));
        setClients(resolvedClients);
        setSelectedClientId(resolvedClients.length > 0 ? "" : NEW_CLIENT_OPTION);
      } finally {
        if (!isCancelled) {
          setIsLoadingClients(false);
        }
      }
    };

    void loadClients();

    return () => {
      isCancelled = true;
    };
  }, [isAuthLoading, resolveOrganizationId, session, supabase]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isAuthLoading) {
      setError("Loading your account. Please try again in a moment.");
      return;
    }

    if (!session) {
      setError("You are not signed in. Please sign in again.");
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const resolvedOrganizationId = organizationId ?? (await resolveOrganizationId());
      if (!resolvedOrganizationId) {
        setError("Could not find or create organization access for this account.");
        return;
      }

      if (!organizationId) {
        setOrganizationId(resolvedOrganizationId);
      }

      const shouldCreateNewClient = selectedClientId === NEW_CLIENT_OPTION || clients.length === 0;
      let resolvedClientId: string | null = null;

      if (shouldCreateNewClient) {
        const trimmedContactName = clientContactName.trim();
        const trimmedCompanyName = clientCompanyName.trim();
        if (!trimmedContactName) {
          setError("Contact name is required.");
          return;
        }
        if (!trimmedCompanyName) {
          setError("Company name is required.");
          return;
        }

        const normalizeOptional = (value: string) => {
          const trimmed = value.trim();
          return trimmed ? trimmed : null;
        };

        const { data: createdClient, error: createClientError } = await supabase
          .from("organization_clients")
          .insert({
            organization_id: resolvedOrganizationId,
            created_by: session.id,
            name: trimmedContactName,
            company_name: trimmedCompanyName,
            email: normalizeOptional(clientEmail),
            phone: normalizeOptional(clientPhone),
          })
          .select("id")
          .single();

        if (createClientError) {
          setError(createClientError.message);
          return;
        }

        resolvedClientId = createdClient.id;
      } else {
        if (!selectedClientId) {
          setError("Please select a client.");
          return;
        }
        resolvedClientId = selectedClientId;
      }

      const baseSlug = toTradePackWorkspaceSlug(trimmedName);
      const { data: existingProjectRows, error: existingProjectsError } = await supabase
        .from("organization_projects")
        .select("slug")
        .eq("organization_id", resolvedOrganizationId)
        .like("slug", `${baseSlug}%`);

      if (existingProjectsError) {
        setError(existingProjectsError.message);
        return;
      }

      const slug = resolveUniqueTradePackWorkspaceSlug(
        baseSlug,
        (existingProjectRows ?? []).map((project) => project.slug)
      );

      const projectId = crypto.randomUUID();

      const { data, error: createProjectError } = await supabase
        .from("organization_projects")
        .insert({
          id: projectId,
          organization_id: resolvedOrganizationId,
          created_by: session.id,
          client_id: resolvedClientId,
          name: trimmedName,
          slug,
          stage,
          location: location.trim() || "Unspecified",
          cover_image_url: null,
        })
        .select("slug")
        .single();

      if (createProjectError) {
        setError(toProjectCreationErrorMessage(createProjectError.message));
        return;
      }

      router.push(`/app/projects/${data.slug}/dashboard`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = `${ibmPlexSans.className} h-[2.9rem] w-full rounded-[0.85rem] border border-[#CBD5E1] bg-white px-4 text-[16px] font-medium text-[#111827] outline-none transition focus:border-[#F15A29]`;
  const selectClass = `${ibmPlexSans.className} h-[2.9rem] w-full appearance-none rounded-[0.85rem] border border-[#CBD5E1] bg-white pl-4 pr-12 text-[16px] font-medium text-[#111827] outline-none transition focus:border-[#F15A29]`;
  const labelClass = `${ibmPlexSans.className} text-[16px] font-semibold text-[#4B5D79] flex items-center`;

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 pt-[25px] pb-8`}>
      <form onSubmit={onSubmit}>
        <Card className="app-surface h-fit rounded-[14px] border-[1.3px] border-[#E2E8F1] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-[1.15rem] pt-[1.35rem]">
            <CardTitle className="mt-0 text-[1.4rem] leading-none tracking-[-0.03em] text-[#1d1d1d]">
              Create a Project
            </CardTitle>
            <div className="flex items-center gap-3">
              <Link
                href="/app/projects"
                className={`${ibmPlexSans.className} inline-flex shrink-0 items-center justify-center rounded-[0.5rem] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || isAuthLoading}
                className={`${ibmPlexSans.className} inline-flex shrink-0 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f] disabled:opacity-60`}
              >
                {isSubmitting ? "Creating..." : isAuthLoading ? "Loading..." : "Create Project"}
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-0 pb-8">
            <div className="grid gap-x-4 gap-y-4 pt-1 md:grid-cols-[160px_minmax(0,1fr)]">

              <p className={labelClass}>Project Name:</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Smith Renovation Project"
                className={inputClass}
                required
              />

              <p className={labelClass}>Client:</p>
              {isLoadingClients ? (
                <p className={`${ibmPlexSans.className} flex items-center text-[16px] font-medium text-[#687996]`}>Loading clients...</p>
              ) : clients.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className={selectClass}
                    required
                  >
                    <option value="">Select a client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.company_name?.trim() || "Unknown Company"}
                      </option>
                    ))}
                    <option value={NEW_CLIENT_OPTION}>+ Add new client</option>
                  </select>
                  <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              ) : (
                <p className={`${ibmPlexSans.className} flex items-center text-[16px] font-medium text-[#687996]`}>
                  No clients yet — fill in details below.
                </p>
              )}

              {(selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) && !isLoadingClients ? (
                <>
                  <p className={labelClass}>Contact Name:</p>
                  <input
                    value={clientContactName}
                    onChange={(e) => setClientContactName(e.target.value)}
                    placeholder="John Smith"
                    className={inputClass}
                    required
                  />

                  <p className={labelClass}>Company Name:</p>
                  <input
                    value={clientCompanyName}
                    onChange={(e) => setClientCompanyName(e.target.value)}
                    placeholder="Smith Developments"
                    className={inputClass}
                    required
                  />

                  <p className={labelClass}>Email:</p>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@company.com"
                    className={inputClass}
                  />

                  <p className={labelClass}>Phone:</p>
                  <input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+64 21 123 4567"
                    className={inputClass}
                  />
                </>
              ) : null}

              <p className={labelClass}>Stage:</p>
              <div className="relative">
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as ProjectStage)}
                  className={selectClass}
                >
                  {PROJECT_STAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>

              <p className={labelClass}>Location:</p>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Auckland"
                className={inputClass}
              />

              {error ? (
                <>
                  <span />
                  <p className={`${ibmPlexSans.className} rounded-[0.85rem] border border-red-200 bg-red-50 px-4 py-2.5 text-[14px] font-medium text-red-700`}>{error}</p>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </form>
    </main>
  );
}
