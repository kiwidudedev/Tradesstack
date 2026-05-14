"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { PROJECT_STAGE_OPTIONS } from "@/lib/projects";
import type { ProjectStage } from "@/lib/projects";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormLabel } from "@/components/app/FormLabel";
import { Input } from "@/components/ui/input";

const NEW_CLIENT_OPTION = "__new_client__";
type OrganizationClient = Database["public"]["Tables"]["organization_clients"]["Row"];

function toProjectCreationErrorMessage(message: string): string {
  if (message.includes("organization_projects_stage_check")) {
    return "Project stage values are out of sync in the database. Apply the latest Supabase migrations and try again.";
  }

  return message;
}


export function CreateProjectDialog({ initialOpen = false }: { initialOpen?: boolean }) {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [open, setOpen] = useState(initialOpen);
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

  useEffect(() => {
    if (initialOpen) {
      setOpen(true);
    }
  }, [initialOpen]);

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
    if (!open || isAuthLoading || !session || !supabase) {
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
        setSelectedClientId((current) => current || (resolvedClients.length > 0 ? "" : NEW_CLIENT_OPTION));
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
  }, [open, isAuthLoading, resolveOrganizationId, session, supabase]);

  const resetForm = () => {
    setName("");
    setStage("Pricing");
    setLocation("");
    setSelectedClientId(clients.length > 0 ? "" : NEW_CLIENT_OPTION);
    setClientContactName("");
    setClientCompanyName("");
    setClientEmail("");
    setClientPhone("");
    setError(null);
    setIsSubmitting(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
      if (initialOpen) {
        router.replace("/app/projects", { scroll: false });
      }
    }
  };

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
      if (!shouldCreateNewClient && !selectedClientId) {
        setError("Please select a client.");
        return;
      }

      if (shouldCreateNewClient && !clientContactName.trim()) {
        setError("Contact name is required.");
        return;
      }

      if (shouldCreateNewClient && !clientCompanyName.trim()) {
        setError("Company name is required.");
        return;
      }

      const response = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          stage,
          location,
          clientId: shouldCreateNewClient ? null : selectedClientId,
          newClient: shouldCreateNewClient
            ? {
                contactName: clientContactName,
                companyName: clientCompanyName,
                email: clientEmail,
                phone: clientPhone,
              }
            : null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; projectSlug?: string } | null;
      if (!response.ok) {
        setError(toProjectCreationErrorMessage(payload?.error ?? "Unable to create project."));
        return;
      }

      if (!payload?.projectSlug) {
        setError("Project creation succeeded but no project slug was returned.");
        return;
      }

      handleOpenChange(false);
      router.push(`/app/projects/${payload.projectSlug}/dashboard`);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)]`;
  const selectClass = `${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`;

  const showNewClientFields = (selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) && !isLoadingClients;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--primary)] bg-[var(--primary)] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition hover:bg-[var(--primary-hover)]`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          Create Project
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <form onSubmit={onSubmit}>
          <DialogHeader className="px-7 pb-6 pt-7">
            <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`}>
              Create a Project
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 px-7 pb-4">
            {/* Project Name */}
            <div>
              <FormLabel htmlFor="projectName">
                Project Name <span className="text-[var(--orange-primary)]">*</span>
              </FormLabel>
              <Input
                id="projectName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Smith Renovation Project"
                className={inputClass}
                required
              />
            </div>

            {/* Client */}
            <div>
              <FormLabel htmlFor="client">
                Client <span className="text-[var(--orange-primary)]">*</span>
              </FormLabel>
              {isLoadingClients ? (
                <p className={`${ibmPlexSans.className} text-[14px] font-medium text-[var(--text-secondary)]`}>Loading clients...</p>
              ) : clients.length > 0 ? (
                <div className="relative">
                  <select
                    id="client"
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
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
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              ) : (
                <p className={`${ibmPlexSans.className} text-[14px] font-medium text-[var(--text-secondary)]`}>
                  No clients yet. Fill in the new client details below.
                </p>
              )}
            </div>

            {/* New client fields */}
            {showNewClientFields ? (
              <>
                <div>
                  <FormLabel htmlFor="contactName">
                    Primary Contact <span className="text-[var(--orange-primary)]">*</span>
                  </FormLabel>
                  <Input
                    id="contactName"
                    value={clientContactName}
                    onChange={(event) => setClientContactName(event.target.value)}
                    placeholder="John Andrews"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <FormLabel htmlFor="companyName">
                    Company Name <span className="text-[var(--orange-primary)]">*</span>
                  </FormLabel>
                  <Input
                    id="companyName"
                    value={clientCompanyName}
                    onChange={(event) => setClientCompanyName(event.target.value)}
                    placeholder="Auckland Developments Ltd"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FormLabel htmlFor="clientEmail">
                      Email
                    </FormLabel>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={clientEmail}
                      onChange={(event) => setClientEmail(event.target.value)}
                      placeholder="Email@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <FormLabel htmlFor="clientPhone">
                      Phone
                    </FormLabel>
                    <Input
                      id="clientPhone"
                      value={clientPhone}
                      onChange={(event) => setClientPhone(event.target.value)}
                      placeholder="+64 9 123 4567"
                      className={inputClass}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {/* Stage */}
            <div>
              <FormLabel htmlFor="stage">
                Stage
              </FormLabel>
              <div className="relative">
                <select
                  id="stage"
                  value={stage}
                  onChange={(event) => setStage(event.target.value as ProjectStage)}
                  className={selectClass}
                >
                  {PROJECT_STAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>

            {/* Location */}
            <div>
              <FormLabel htmlFor="location">
                Location
              </FormLabel>
              <Input
                id="location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Auckland"
                className={inputClass}
              />
            </div>

            {error ? (
              <p className={`${ibmPlexSans.className} rounded-[0.6rem] border border-[var(--error-light)] bg-[var(--error-light)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--error)]`}>
                {error}
              </p>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <button
                type="button"
                className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={isSubmitting || isAuthLoading}
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60`}
            >
              {isSubmitting ? "Creating..." : isAuthLoading ? "Loading..." : "Create Project"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
