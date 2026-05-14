"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { resolveUniqueProjectSlug, toProjectSlug } from "@/lib/projects";
import { interMedium } from "@/lib/fonts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { canManageCommercialData } from "@/lib/role-permissions";

const NEW_CLIENT_OPTION = "__new_client__";
type OrganizationClient = Pick<Database["public"]["Tables"]["organization_clients"]["Row"], "id" | "name" | "company_name">;
type OrganizationMember = Pick<Database["public"]["Tables"]["organization_members"]["Row"], "user_id" | "display_name">;

export default function NewOpportunityPage() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [clients, setClients] = useState<OrganizationClient[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedOwnerUserId, setSelectedOwnerUserId] = useState<string>("");
  const [clientContactName, setClientContactName] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [isLoadingFormData, setIsLoadingFormData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManageOpportunities = canManageCommercialData(session?.role);

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

    const loadFormData = async () => {
      setIsLoadingFormData(true);
      try {
        const resolvedOrganizationId = await resolveOrganizationId();
        if (!resolvedOrganizationId) {
          if (!isCancelled) {
            setError("Could not resolve organization.");
          }
          return;
        }

        if (!isCancelled) {
          setOrganizationId(resolvedOrganizationId);
        }

        const [clientsResult, membersResult] = await Promise.all([
          supabase
            .from("organization_clients")
            .select("id, name, company_name")
            .eq("organization_id", resolvedOrganizationId)
            .order("company_name", { ascending: true }),
          supabase
            .from("organization_members")
            .select("user_id, display_name")
            .eq("organization_id", resolvedOrganizationId)
            .order("display_name", { ascending: true }),
        ]);

        if (clientsResult.error || membersResult.error) {
          if (!isCancelled) {
            setError(clientsResult.error?.message ?? membersResult.error?.message ?? "Failed to load form data.");
          }
          return;
        }

        if (isCancelled) {
          return;
        }

        const resolvedClients = (clientsResult.data ?? []).sort((left, right) => {
          const leftLabel = (left.company_name?.trim() || "").toLowerCase();
          const rightLabel = (right.company_name?.trim() || "").toLowerCase();
          return leftLabel.localeCompare(rightLabel);
        });
        const resolvedMembers = membersResult.data ?? [];

        setClients(resolvedClients);
        setMembers(resolvedMembers);
        setSelectedClientId(resolvedClients.length > 0 ? "" : NEW_CLIENT_OPTION);

        const ownerFromSession = resolvedMembers.find((member) => member.user_id === session.id);
        setSelectedOwnerUserId(ownerFromSession?.user_id ?? resolvedMembers[0]?.user_id ?? session.id);
      } finally {
        if (!isCancelled) {
          setIsLoadingFormData(false);
        }
      }
    };

    void loadFormData();

    return () => {
      isCancelled = true;
    };
  }, [isAuthLoading, resolveOrganizationId, session, supabase]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !session || isAuthLoading) {
      setError("You must be signed in.");
      return;
    }

    if (!canManageOpportunities) {
      setError("You do not have permission to create opportunities.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Opportunity name is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const resolvedOrganizationId = organizationId ?? (await resolveOrganizationId());
      if (!resolvedOrganizationId) {
        setError("Could not resolve organization.");
        return;
      }

      if (!organizationId) {
        setOrganizationId(resolvedOrganizationId);
      }

      let resolvedClientId: string | null = null;
      const shouldCreateNewClient = selectedClientId === NEW_CLIENT_OPTION || clients.length === 0;

      if (shouldCreateNewClient) {
        const trimmedCompanyName = clientCompanyName.trim();
        const trimmedContactName = clientContactName.trim();
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
          return trimmed.length > 0 ? trimmed : null;
        };

        const createClientResult = await supabase
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

        if (createClientResult.error) {
          setError(createClientResult.error.message);
          return;
        }

        resolvedClientId = createClientResult.data.id;
      } else {
        if (!selectedClientId) {
          setError("Please select a client.");
          return;
        }
        resolvedClientId = selectedClientId;
      }

      const baseSlug = toProjectSlug(trimmedName);
      const existingResult = await supabase
        .from("organization_opportunities")
        .select("slug")
        .eq("organization_id", resolvedOrganizationId)
        .like("slug", `${baseSlug}%`);
      if (existingResult.error) {
        setError(existingResult.error.message);
        return;
      }
      const slug = resolveUniqueProjectSlug(
        baseSlug,
        (existingResult.data ?? []).map((item) => item.slug)
      );

      const workspaceBaseSlug = toProjectSlug(`${slug}-tender`);
      const existingWorkspaceSlugsResult = await supabase
        .from("organization_projects")
        .select("slug")
        .eq("organization_id", resolvedOrganizationId)
        .like("slug", `${workspaceBaseSlug}%`);

      if (existingWorkspaceSlugsResult.error) {
        setError(existingWorkspaceSlugsResult.error.message);
        return;
      }

      const workspaceSlug = resolveUniqueProjectSlug(
        workspaceBaseSlug,
        (existingWorkspaceSlugsResult.data ?? []).map((item) => item.slug)
      );

      const workspaceInsertResult = await supabase
        .from("organization_projects")
        .insert({
          organization_id: resolvedOrganizationId,
          created_by: session.id,
          client_id: resolvedClientId,
          name: `${trimmedName} Tender Workspace`,
          slug: workspaceSlug,
          stage: "Pricing",
          location: location.trim() || "Unspecified",
          cover_image_url: null,
        })
        .select("id")
        .single();

      if (workspaceInsertResult.error) {
        setError(workspaceInsertResult.error.message);
        return;
      }

      const insertResult = await supabase
        .from("organization_opportunities")
        .insert({
          organization_id: resolvedOrganizationId,
          created_by: session.id,
          owner_user_id: selectedOwnerUserId || session.id,
          client_id: resolvedClientId,
          workspace_project_id: workspaceInsertResult.data.id,
          name: trimmedName,
          slug,
          stage: "New",
          location: location.trim() || "Unspecified",
          due_date: dueDate || null,
          estimated_value: Number(estimatedValue || "0"),
        })
        .select("slug")
        .single();

      if (insertResult.error) {
        await supabase
          .from("organization_projects")
          .delete()
          .eq("organization_id", resolvedOrganizationId)
          .eq("id", workspaceInsertResult.data.id);
        setError(insertResult.error.message);
        return;
      }

      router.push(`/app/leads-clients/opportunities/${insertResult.data.slug}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = `font-[family-name:var(--font-ibm-plex-sans)] h-[2.75rem] w-full rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)]`;
  const selectClass = `font-[family-name:var(--font-ibm-plex-sans)] h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`;
  const labelClass = `font-[family-name:var(--font-ibm-plex-sans)] mb-1 block text-[13px] font-semibold text-[var(--text-primary)]`;

  return (
    <main className="pb-8">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        asChild
        className={`${interMedium.className} mb-6 h-8 rounded-[6px] px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-transparent hover:text-[var(--text-primary)]`}
      >
        <Link href="/app/leads-clients/opportunities">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Opportunities
        </Link>
      </Button>

      <div className="w-full max-w-[660px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-overlay)]">
        {!isAuthLoading && session && !canManageOpportunities ? (
          <p className={`${interMedium.className} mx-7 mt-7 rounded-[0.6rem] border border-[var(--warning-light)] bg-[var(--warning-light)] px-3 py-2 text-sm font-medium text-[var(--warning)]`}>
            Only owner, admin, QS, and project manager roles can create opportunities.
          </p>
        ) : null}

        <div className="px-7 pb-6 pt-7">
          <h1 className="font-[family-name:var(--font-ibm-plex-sans)] m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
            Create Tender Opportunity
          </h1>
          <p className={`${interMedium.className} mt-3 text-sm font-medium text-[var(--text-secondary)]`}>
            Log a new tender so the team can start pricing.
          </p>
        </div>

        <form className="space-y-3.5 px-7 pb-4" onSubmit={onSubmit}>
          {/* Tender Name + Client */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="opportunityName" className={labelClass}>
                Tender Name <span className="text-[var(--orange-primary)]">*</span>
              </label>
              <Input
                id="opportunityName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Hobson Office Upgrade"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="opportunityClient" className={labelClass}>
                Client <span className="text-[var(--orange-primary)]">*</span>
              </label>
              {isLoadingFormData ? (
                <p className="text-[14px] font-medium text-[var(--text-secondary)]">Loading clients...</p>
              ) : clients.length > 0 ? (
                <div className="relative">
                  <select
                    id="opportunityClient"
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    className={selectClass}
                    disabled={isAuthLoading}
                    required={clients.length > 0}
                  >
                    <option value="">Select a client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.company_name?.trim() || "Unknown Company"}
                      </option>
                    ))}
                    <option value={NEW_CLIENT_OPTION}>Add new client</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              ) : (
                <p className="text-[14px] font-medium text-[var(--text-secondary)]">No clients yet. Add a client below.</p>
              )}
            </div>
          </div>

          {/* Project Location */}
          <div>
            <label htmlFor="opportunityLocation" className={labelClass}>Project Location</label>
            <Input
              id="opportunityLocation"
              autoComplete="street-address"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Hobson Street, Auckland"
              className={inputClass}
            />
          </div>

          {/* New client fields */}
          {(selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) && !isLoadingFormData ? (
            <>
              <div>
                <label htmlFor="clientContactName" className={labelClass}>
                  Contact Name <span className="text-[var(--orange-primary)]">*</span>
                </label>
                <Input
                  id="clientContactName"
                  value={clientContactName}
                  onChange={(event) => setClientContactName(event.target.value)}
                  placeholder="John Andrews"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="clientCompanyName" className={labelClass}>
                  Company Name <span className="text-[var(--orange-primary)]">*</span>
                </label>
                <Input
                  id="clientCompanyName"
                  value={clientCompanyName}
                  onChange={(event) => setClientCompanyName(event.target.value)}
                  placeholder="Auckland Developments Ltd"
                  className={inputClass}
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="clientEmail" className={labelClass}>Email</label>
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
                  <label htmlFor="clientPhone" className={labelClass}>Phone</label>
                  <Input
                    id="clientPhone"
                    value={clientPhone}
                    onChange={(event) => setClientPhone(event.target.value)}
                    placeholder="+64 21 123 4567"
                    className={inputClass}
                  />
                </div>
              </div>
            </>
          ) : null}

          {/* Due Date + Estimated Value */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="opportunityDueDate" className={labelClass}>
                Tender Due Date <span className="text-[var(--orange-primary)]">*</span>
              </label>
              <Input
                id="opportunityDueDate"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="opportunityValue" className={labelClass}>Estimated Value (NZD)</label>
              <Input
                id="opportunityValue"
                type="number"
                min="0"
                step="100"
                value={estimatedValue}
                onChange={(event) => setEstimatedValue(event.target.value)}
                placeholder="500000"
                className={inputClass}
              />
            </div>
          </div>

          {/* Estimator / Owner */}
          <div>
            <label htmlFor="opportunityOwner" className={labelClass}>
              Estimator / Owner <span className="text-[var(--orange-primary)]">*</span>
            </label>
            {isLoadingFormData ? (
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">Loading estimators...</p>
            ) : (
              <div className="relative">
                <select
                  id="opportunityOwner"
                  value={selectedOwnerUserId}
                  onChange={(event) => setSelectedOwnerUserId(event.target.value)}
                  className={selectClass}
                >
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            )}
          </div>

          {error ? (
            <p className="rounded-[0.6rem] border border-[var(--error-light)] bg-[var(--error-light)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--error)]">
              {error}
            </p>
          ) : null}
        </form>

        <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
          <Link
            href="/app/leads-clients/opportunities"
            className="font-[family-name:var(--font-ibm-plex-sans)] inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            form="opportunityForm"
            disabled={!canManageOpportunities || isSubmitting || isAuthLoading || isLoadingFormData}
            onClick={(e) => { e.preventDefault(); document.querySelector<HTMLFormElement>("form")?.requestSubmit(); }}
            className="font-[family-name:var(--font-ibm-plex-sans)] inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {isSubmitting ? "Creating..." : "Create Tender"}
          </button>
        </div>
      </div>
    </main>
  );
}
