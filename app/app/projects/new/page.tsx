"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { PROJECT_STAGE_OPTIONS } from "@/lib/projects";
import type { ProjectStage } from "@/lib/projects";
import {
  resolveUniqueTradePackWorkspaceSlug,
  toTradePackWorkspaceSlug,
} from "@/lib/trade-pack-workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
          .order("name", { ascending: true });

        if (clientsError) {
          if (!isCancelled) {
            setError(clientsError.message);
          }
          return;
        }

        if (isCancelled) {
          return;
        }

        const resolvedClients = clientRows ?? [];
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
        const trimmedCompanyName = clientCompanyName.trim();
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
            name: trimmedCompanyName,
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

  return (
    <main className="space-y-8 pb-8">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        asChild
        className={`${interMedium.className} h-8 rounded-[8px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
      >
        <Link href="/app/dashboard">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Main Dashboard
        </Link>
      </Button>

      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Create a Project</CardTitle>
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[#4d5b74]`}>
            Upload project documents and generate construction intelligence to support planning, pricing, and delivery.
          </p>
        </CardHeader>
        <CardContent className="max-w-2xl pb-8">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="projectName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project / Tender Name
              </label>
              <Input
                id="projectName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Smith Renovation Project"
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="projectClient" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Client
              </label>
              {isLoadingClients ? (
                <p className={`${interMedium.className} text-sm font-medium text-[#687996]`}>Loading clients...</p>
              ) : clients.length > 0 ? (
                <select
                  id="projectClient"
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  className={`${interMedium.className} h-11 w-full rounded-[10px] border border-[#cdd4e2] bg-white px-3 text-sm text-[#1d2433] outline-none focus:border-[#94a3b8]`}
                  required
                >
                  <option value="">Select a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                  <option value={NEW_CLIENT_OPTION}>Add new client</option>
                </select>
              ) : (
                <p className={`${interMedium.className} text-sm font-medium text-[#687996]`}>
                  No clients yet. Add a client below to continue.
                </p>
              )}
            </div>

            {(selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) && !isLoadingClients ? (
              <div className="rounded-[10px] border border-[#d7deea] bg-[#f8faff] p-3">
                <p className={`${interMedium.className} mb-3 text-sm font-semibold text-[#1d2433]`}>New Client Details</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label htmlFor="clientCompanyName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                      Company Name *
                    </label>
                    <Input
                      id="clientCompanyName"
                      value={clientCompanyName}
                      onChange={(event) => setClientCompanyName(event.target.value)}
                      placeholder="Smith Developments"
                      className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                      required
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="clientEmail" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                        Email
                      </label>
                      <Input
                        id="clientEmail"
                        type="email"
                        value={clientEmail}
                        onChange={(event) => setClientEmail(event.target.value)}
                        placeholder="client@company.com"
                        className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="clientPhone" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                        Phone
                      </label>
                      <Input
                        id="clientPhone"
                        value={clientPhone}
                        onChange={(event) => setClientPhone(event.target.value)}
                        placeholder="+64 21 123 4567"
                        className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="projectStage" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Job Stage
              </label>
              <select
                id="projectStage"
                value={stage}
                onChange={(event) => setStage(event.target.value as ProjectStage)}
                className={`${interMedium.className} h-11 w-full rounded-[10px] border border-[#cdd4e2] bg-white px-3 text-sm text-[#1d2433] outline-none focus:border-[#94a3b8]`}
              >
                {PROJECT_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="projectLocation" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project Location
              </label>
              <Input
                id="projectLocation"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Auckland"
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
              />
            </div>

            {error ? (
              <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
            ) : null}

            <Button
              type="submit"
              disabled={isSubmitting || isAuthLoading}
              className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]`}
            >
              {isSubmitting ? "Creating project..." : isAuthLoading ? "Loading account..." : "Create Project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
