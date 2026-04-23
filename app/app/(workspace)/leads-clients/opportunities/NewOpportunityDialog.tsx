"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { resolveUniqueProjectSlug, toProjectSlug } from "@/lib/projects";
import { ibmPlexSans } from "@/lib/fonts";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { canManageCommercialData } from "@/lib/role-permissions";

const NEW_CLIENT_OPTION = "__new_client__";
type OrganizationClient = Pick<Database["public"]["Tables"]["organization_clients"]["Row"], "id" | "name" | "company_name">;
type OrganizationMember = Pick<Database["public"]["Tables"]["organization_members"]["Row"], "user_id" | "display_name">;

const inputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`;
const selectClass = `${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`;
const labelClass = `${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`;

export function NewOpportunityDialog() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [open, setOpen] = useState(false);

  const supabase = useMemo(() => {
    try { return createBrowserSupabaseClient(); } catch { return null; }
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
    if (!session || !supabase) return null;
    if (session.organizationId) return session.organizationId;
    const { data: ensuredOrganizationId, error: ensureError } = await supabase.rpc("ensure_organization_membership");
    if (!ensureError && ensuredOrganizationId) return ensuredOrganizationId;
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
    if (!open || isAuthLoading || !session || !supabase) return;
    let isCancelled = false;
    const loadFormData = async () => {
      setIsLoadingFormData(true);
      try {
        const resolvedOrganizationId = await resolveOrganizationId();
        if (!resolvedOrganizationId) { if (!isCancelled) setError("Could not resolve organization."); return; }
        if (!isCancelled) setOrganizationId(resolvedOrganizationId);
        const [clientsResult, membersResult] = await Promise.all([
          supabase.from("organization_clients").select("id, name, company_name").eq("organization_id", resolvedOrganizationId).order("company_name", { ascending: true }),
          supabase.from("organization_members").select("user_id, display_name").eq("organization_id", resolvedOrganizationId).order("display_name", { ascending: true }),
        ]);
        if (clientsResult.error || membersResult.error) {
          if (!isCancelled) setError(clientsResult.error?.message ?? membersResult.error?.message ?? "Failed to load form data.");
          return;
        }
        if (isCancelled) return;
        const resolvedClients = (clientsResult.data ?? []).sort((a, b) => (a.company_name?.trim() || "").toLowerCase().localeCompare((b.company_name?.trim() || "").toLowerCase()));
        const resolvedMembers = membersResult.data ?? [];
        setClients(resolvedClients);
        setMembers(resolvedMembers);
        setSelectedClientId(resolvedClients.length > 0 ? "" : NEW_CLIENT_OPTION);
        const ownerFromSession = resolvedMembers.find((m) => m.user_id === session.id);
        setSelectedOwnerUserId(ownerFromSession?.user_id ?? resolvedMembers[0]?.user_id ?? session.id);
      } finally { if (!isCancelled) setIsLoadingFormData(false); }
    };
    void loadFormData();
    return () => { isCancelled = true; };
  }, [open, isAuthLoading, resolveOrganizationId, session, supabase]);

  const resetForm = () => {
    setName(""); setLocation(""); setDueDate(""); setEstimatedValue("");
    setSelectedClientId(""); setSelectedOwnerUserId("");
    setClientContactName(""); setClientCompanyName(""); setClientEmail(""); setClientPhone("");
    setError(null); setIsSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !session || isAuthLoading) { setError("You must be signed in."); return; }
    if (!canManageOpportunities) { setError("You do not have permission to create opportunities."); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Opportunity name is required."); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const resolvedOrganizationId = organizationId ?? (await resolveOrganizationId());
      if (!resolvedOrganizationId) { setError("Could not resolve organization."); return; }
      if (!organizationId) setOrganizationId(resolvedOrganizationId);

      let resolvedClientId: string | null = null;
      const shouldCreateNewClient = selectedClientId === NEW_CLIENT_OPTION || clients.length === 0;
      if (shouldCreateNewClient) {
        const trimmedContactName = clientContactName.trim();
        const trimmedCompanyName = clientCompanyName.trim();
        if (!trimmedContactName) { setError("Contact name is required."); return; }
        if (!trimmedCompanyName) { setError("Company name is required."); return; }
        const normalize = (v: string) => { const t = v.trim(); return t.length > 0 ? t : null; };
        const createClientResult = await supabase.from("organization_clients").insert({
          organization_id: resolvedOrganizationId, created_by: session.id,
          name: trimmedContactName, company_name: trimmedCompanyName,
          email: normalize(clientEmail), phone: normalize(clientPhone),
        }).select("id").single();
        if (createClientResult.error) { setError(createClientResult.error.message); return; }
        resolvedClientId = createClientResult.data.id;
      } else {
        if (!selectedClientId) { setError("Please select a client."); return; }
        resolvedClientId = selectedClientId;
      }

      const baseSlug = toProjectSlug(trimmedName);
      const existingResult = await supabase.from("organization_opportunities").select("slug").eq("organization_id", resolvedOrganizationId).like("slug", `${baseSlug}%`);
      if (existingResult.error) { setError(existingResult.error.message); return; }
      const slug = resolveUniqueProjectSlug(baseSlug, (existingResult.data ?? []).map((i) => i.slug));

      const workspaceBaseSlug = toProjectSlug(`${slug}-tender`);
      const existingWsResult = await supabase.from("organization_projects").select("slug").eq("organization_id", resolvedOrganizationId).like("slug", `${workspaceBaseSlug}%`);
      if (existingWsResult.error) { setError(existingWsResult.error.message); return; }
      const workspaceSlug = resolveUniqueProjectSlug(workspaceBaseSlug, (existingWsResult.data ?? []).map((i) => i.slug));

      const wsInsert = await supabase.from("organization_projects").insert({
        organization_id: resolvedOrganizationId, created_by: session.id, client_id: resolvedClientId,
        name: `${trimmedName} Tender Workspace`, slug: workspaceSlug, stage: "Pricing",
        location: location.trim() || "Unspecified", cover_image_url: null,
      }).select("id").single();
      if (wsInsert.error) { setError(wsInsert.error.message); return; }

      const insertResult = await supabase.from("organization_opportunities").insert({
        organization_id: resolvedOrganizationId, created_by: session.id,
        owner_user_id: selectedOwnerUserId || session.id, client_id: resolvedClientId,
        workspace_project_id: wsInsert.data.id, name: trimmedName, slug, stage: "New",
        location: location.trim() || "Unspecified", due_date: dueDate || null,
        estimated_value: Number(estimatedValue || "0"),
      }).select("slug").single();

      if (insertResult.error) {
        await supabase.from("organization_projects").delete().eq("organization_id", resolvedOrganizationId).eq("id", wsInsert.data.id);
        setError(insertResult.error.message);
        return;
      }

      handleOpenChange(false);
      router.push(`/app/leads-clients/opportunities/${insertResult.data.slug}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[#F15A29] bg-[#F15A29] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition-opacity hover:opacity-90`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          New Opportunity
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <form onSubmit={onSubmit}>
          <DialogHeader className="px-7 pb-6 pt-7">
            <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}>
              New Opportunity
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 px-7 pb-4">
            {!isAuthLoading && session && !canManageOpportunities ? (
              <p className="rounded-[0.6rem] border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium text-amber-800">
                Only owner, admin, QS, and project manager roles can create opportunities.
              </p>
            ) : null}

            {/* Tender Name */}
            <div>
              <label htmlFor="oppName" className={labelClass}>Tender Name <span className="text-[#FF4C14]">*</span></label>
              <Input id="oppName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hobson Office Upgrade" className={inputClass} required />
            </div>

            {/* Client */}
            <div>
              <label htmlFor="oppClient" className={labelClass}>Client <span className="text-[#FF4C14]">*</span></label>
              {isLoadingFormData ? (
                <p className="text-[14px] font-medium text-[#687996]">Loading clients...</p>
              ) : clients.length > 0 ? (
                <div className="relative">
                  <select id="oppClient" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className={selectClass} disabled={isAuthLoading} required={clients.length > 0}>
                    <option value="">Select a client</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name?.trim() || "Unknown Company"}</option>)}
                    <option value={NEW_CLIENT_OPTION}>Add new client</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              ) : (
                <p className="text-[14px] font-medium text-[#687996]">No clients yet. Add below.</p>
              )}
            </div>

            {/* Project Location */}
            <div>
              <label htmlFor="oppLocation" className={labelClass}>Project Location</label>
              <Input id="oppLocation" autoComplete="street-address" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hobson Street, Auckland" className={inputClass} />
            </div>

            {/* New client fields */}
            {(selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) && !isLoadingFormData ? (
              <>
                <div>
                  <label htmlFor="oppContactName" className={labelClass}>Contact Name <span className="text-[#FF4C14]">*</span></label>
                  <Input id="oppContactName" value={clientContactName} onChange={(e) => setClientContactName(e.target.value)} placeholder="John Andrews" className={inputClass} required />
                </div>
                <div>
                  <label htmlFor="oppCompanyName" className={labelClass}>Company Name <span className="text-[#FF4C14]">*</span></label>
                  <Input id="oppCompanyName" value={clientCompanyName} onChange={(e) => setClientCompanyName(e.target.value)} placeholder="Auckland Developments Ltd" className={inputClass} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="oppEmail" className={labelClass}>Email</label>
                    <Input id="oppEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Email@example.com" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="oppPhone" className={labelClass}>Phone</label>
                    <Input id="oppPhone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+64 9 123 4567" className={inputClass} />
                  </div>
                </div>
              </>
            ) : null}

            {/* Due Date + Estimated Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="oppDueDate" className={labelClass}>Tender Due Date <span className="text-[#FF4C14]">*</span></label>
                <Input id="oppDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="oppValue" className={labelClass}>Estimated Value (NZD)</label>
                <Input id="oppValue" type="number" min="0" step="100" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="500000" className={inputClass} />
              </div>
            </div>

            {/* Estimator / Owner */}
            <div>
              <label htmlFor="oppOwner" className={labelClass}>Estimator / Owner <span className="text-[#FF4C14]">*</span></label>
              {isLoadingFormData ? (
                <p className="text-[14px] font-medium text-[#687996]">Loading estimators...</p>
              ) : (
                <div className="relative">
                  <select id="oppOwner" value={selectedOwnerUserId} onChange={(e) => setSelectedOwnerUserId(e.target.value)} className={selectClass}>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </div>

            {error ? (
              <p className="rounded-[0.6rem] border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <button type="button" className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}>
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={!canManageOpportunities || isSubmitting || isAuthLoading || isLoadingFormData}
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f] disabled:opacity-60`}
            >
              {isSubmitting ? "Creating..." : "Create Tender"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
