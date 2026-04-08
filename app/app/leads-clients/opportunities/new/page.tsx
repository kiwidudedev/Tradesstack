"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { resolveUniqueProjectSlug, toProjectSlug } from "@/lib/projects";
import { interMedium } from "@/lib/fonts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <main className="space-y-6 pb-8">
      {!isAuthLoading && session && !canManageOpportunities ? (
        <p className={`${interMedium.className} rounded-[6px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800`}>
          Only owner, admin, QS, and project manager roles can create opportunities.
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        asChild
        className={`${interMedium.className} h-8 rounded-[6px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
      >
        <Link href="/app/leads-clients/opportunities">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Opportunities
        </Link>
      </Button>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-4 pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Create Tender Opportunity</CardTitle>
          <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5F7390]`}>
            Log a new tender so the team can start pricing.
          </p>
        </CardHeader>
        <CardContent className="max-w-2xl pb-8">
          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="opportunityName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                  Tender Name *
                </label>
                <Input
                  id="opportunityName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Hobson Office Upgrade"
                  className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="opportunityClient" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                  Client *
                </label>
                {isLoadingFormData ? (
                  <p className={`${interMedium.className} text-sm font-medium text-[#687996]`}>Loading clients...</p>
                ) : clients.length > 0 ? (
                  <select
                    id="opportunityClient"
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    className={`${interMedium.className} h-11 w-full rounded-[6px] border border-[#cdd4e2] bg-white px-3 text-sm text-[#1d2433] outline-none focus:border-[#94a3b8]`}
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
                ) : (
                  <p className={`${interMedium.className} text-sm font-medium text-[#687996]`}>
                    No clients yet. Add a client below to continue.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="opportunityLocation" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project Location
              </label>
              <Input
                id="opportunityLocation"
                autoComplete="street-address"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Hobson Street, Auckland"
                className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
              />
            </div>

            {(selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) && !isLoadingFormData ? (
              <div className="space-y-3">
                <p className={`${interMedium.className} text-sm font-semibold text-[#1d2433]`}>New Client Details</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label htmlFor="clientContactName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                      Contact Name *
                    </label>
                    <Input
                      id="clientContactName"
                      value={clientContactName}
                      onChange={(event) => setClientContactName(event.target.value)}
                      placeholder="John Smith"
                      className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="clientCompanyName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                      Company Name *
                    </label>
                    <Input
                      id="clientCompanyName"
                      value={clientCompanyName}
                      onChange={(event) => setClientCompanyName(event.target.value)}
                      placeholder="Meridian PM"
                      className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
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
                        className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
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
                        className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                  <label htmlFor="opportunityDueDate" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                    Tender Due Date *
                  </label>
                <Input
                    id="opportunityDueDate"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                    required
                />
              </div>
              <div className="space-y-2">
                  <label htmlFor="opportunityValue" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                    Estimated Value (NZD)
                  </label>
                <Input
                    id="opportunityValue"
                    type="number"
                    min="0"
                    step="100"
                    value={estimatedValue}
                    onChange={(event) => setEstimatedValue(event.target.value)}
                    placeholder="500000"
                  className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                />
              </div>
            </div>

            <div className="space-y-2">
                <label htmlFor="opportunityOwner" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Estimator / Owner *
                </label>
                {isLoadingFormData ? (
                  <p className={`${interMedium.className} text-sm font-medium text-[#687996]`}>Loading estimators...</p>
                ) : (
                  <select
                    id="opportunityOwner"
                    value={selectedOwnerUserId}
                    onChange={(event) => setSelectedOwnerUserId(event.target.value)}
                    className={`${interMedium.className} h-11 w-full rounded-[6px] border border-[#cdd4e2] bg-white px-3 text-sm text-[#1d2433] outline-none focus:border-[#94a3b8]`}
                  >
                    {members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.display_name}
                      </option>
                    ))}
                  </select>
                )}
            </div>

            {error ? (
              <p className={`${interMedium.className} rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>
                {error}
              </p>
            ) : null}

            <div className="border-t border-[#E6EAF0] pt-4">
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="ghost" asChild className="h-10 rounded-[6px] px-4 text-sm">
                  <Link href="/app/leads-clients/opportunities">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={!canManageOpportunities || isSubmitting || isAuthLoading || isLoadingFormData}
                  className={`${interMedium.className} h-10 rounded-[6px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]`}
                >
                  {isSubmitting ? "Creating..." : "Create Tender"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
