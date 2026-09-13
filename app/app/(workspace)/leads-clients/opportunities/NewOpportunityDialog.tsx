"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  clearStableOpportunityCreationRequestId,
  getStableOpportunityCreationRequestId,
  submitAuthoritativeOpportunityCreation,
} from "@/lib/opportunity-creation-client";
import type {
  OpportunityCreationClient,
  OpportunityCreationDependencies,
  OpportunityCreationMember,
} from "@/lib/opportunity-creation-dependencies-server";
import { ibmPlexSans } from "@/lib/fonts";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormLabel } from "@/components/app/FormLabel";
import { useAuth } from "@/hooks/use-auth";
import { canManageCommercialData } from "@/lib/role-permissions";
import { TenderClientMultiSelect, withPrimaryTenderClient } from "@/components/app/TenderClientMultiSelect";

const NEW_CLIENT_OPTION = "__new_client__";

const inputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)]`;
const selectClass = `${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`;

function initialPrimaryClientId(clients: OpportunityCreationClient[], loadError: string | null) {
  return loadError || clients.length > 0 ? "" : NEW_CLIENT_OPTION;
}

function initialOwnerUserId(members: OpportunityCreationMember[], currentUserId: string | null) {
  return members.find((member) => member.user_id === currentUserId)?.user_id
    ?? members[0]?.user_id
    ?? currentUserId
    ?? "";
}

export function NewOpportunityDialog({
  clients,
  members,
  currentUserId,
  loadError,
}: OpportunityCreationDependencies) {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>(() => initialPrimaryClientId(clients, loadError));
  const [selectedTenderClientIds, setSelectedTenderClientIds] = useState<string[]>([]);
  const [selectedOwnerUserId, setSelectedOwnerUserId] = useState<string>(() => initialOwnerUserId(members, currentUserId));
  const [clientContactName, setClientContactName] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManageOpportunities = canManageCommercialData(session?.role);

  const resetForm = () => {
    setName(""); setLocation(""); setDueDate(""); setEstimatedValue("");
    setSelectedClientId(initialPrimaryClientId(clients, loadError));
    setSelectedOwnerUserId(initialOwnerUserId(members, currentUserId));
    setSelectedTenderClientIds([]);
    setClientContactName(""); setClientCompanyName(""); setClientEmail(""); setClientPhone("");
    setError(null); setIsSubmitting(false);
    clearStableOpportunityCreationRequestId("dialog");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || isAuthLoading) { setError("You must be signed in."); return; }
    if (loadError) { setError(loadError); return; }
    if (!canManageOpportunities) { setError("You do not have permission to create opportunities."); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Opportunity name is required."); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const shouldCreateNewClient = selectedClientId === NEW_CLIENT_OPTION || clients.length === 0;
      if (shouldCreateNewClient) {
        const trimmedContactName = clientContactName.trim();
        const trimmedCompanyName = clientCompanyName.trim();
        if (!trimmedContactName) { setError("Contact name is required."); return; }
        if (!trimmedCompanyName) { setError("Company name is required."); return; }
      } else {
        if (!selectedClientId) { setError("Please select a client."); return; }
      }

      const insertResult = await submitAuthoritativeOpportunityCreation({
        creationRequestId: getStableOpportunityCreationRequestId("dialog"),
        name: trimmedName,
        location,
        clientId: shouldCreateNewClient ? null : selectedClientId,
        tenderClientIds: Array.from(new Set([
          ...selectedTenderClientIds,
          ...(shouldCreateNewClient ? [] : [selectedClientId]),
        ])),
        newClient: shouldCreateNewClient
          ? {
              contactName: clientContactName,
              companyName: clientCompanyName,
              email: clientEmail,
              phone: clientPhone,
            }
          : null,
        ownerUserId: selectedOwnerUserId || session.id,
        dueDate: dueDate || null,
        estimatedValue: Number(estimatedValue || "0"),
      });

      handleOpenChange(false);
      router.push(`/app/leads-clients/opportunities/${insertResult.opportunitySlug}`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to create opportunity.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--primary)] bg-[var(--primary)] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition-opacity hover:opacity-90`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          New Opportunity
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <form onSubmit={onSubmit}>
          <DialogHeader className="px-7 pb-6 pt-7">
            <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`}>
              New Opportunity
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 px-7 pb-4">
            {!isAuthLoading && session && !canManageOpportunities ? (
              <p className="rounded-[0.6rem] border border-[var(--warning-light)] bg-[var(--warning-light)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--warning)]">
                Only owner, admin, QS, and project manager roles can create opportunities.
              </p>
            ) : null}

            {/* Tender Name */}
            <div>
              <FormLabel htmlFor="oppName">Tender Name <span className="text-[var(--orange-primary)]">*</span></FormLabel>
              <Input id="oppName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hobson Office Upgrade" className={inputClass} required />
            </div>

            {/* Primary client */}
            <div>
              <FormLabel htmlFor="oppClient">Primary Client <span className="text-[var(--orange-primary)]">*</span></FormLabel>
              <div className="relative">
                <select id="oppClient" value={selectedClientId} onChange={(e) => {
                  const nextClientId = e.target.value;
                  setSelectedClientId(nextClientId);
                  if (nextClientId && nextClientId !== NEW_CLIENT_OPTION) {
                    setSelectedTenderClientIds((current) => withPrimaryTenderClient(current, nextClientId));
                  }
                }} className={selectClass} disabled={isAuthLoading || Boolean(loadError)} required>
                  {loadError ? <option value="">Clients unavailable</option> : null}
                  {!loadError && clients.length > 0 ? <option value="">Select a client</option> : null}
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name?.trim() || "Unknown Company"}</option>)}
                  {!loadError ? <option value={NEW_CLIENT_OPTION}>Add new client</option> : null}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>

            <div>
              <FormLabel htmlFor="oppTenderClients">Tender Clients</FormLabel>
              <TenderClientMultiSelect
                id="oppTenderClients"
                clients={clients}
                selectedIds={selectedTenderClientIds}
                primaryClientId={selectedClientId}
                onChange={setSelectedTenderClientIds}
                disabled={isAuthLoading || Boolean(loadError) || clients.length === 0}
              />
            </div>

            {/* Project Location */}
            <div>
              <FormLabel htmlFor="oppLocation">Project Location</FormLabel>
              <Input id="oppLocation" autoComplete="street-address" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hobson Street, Auckland" className={inputClass} />
            </div>

            {/* New client fields */}
            {!loadError && (selectedClientId === NEW_CLIENT_OPTION || clients.length === 0) ? (
              <>
                <div>
                  <FormLabel htmlFor="oppContactName">Contact Name <span className="text-[var(--orange-primary)]">*</span></FormLabel>
                  <Input id="oppContactName" value={clientContactName} onChange={(e) => setClientContactName(e.target.value)} placeholder="John Andrews" className={inputClass} required />
                </div>
                <div>
                  <FormLabel htmlFor="oppCompanyName">Company Name <span className="text-[var(--orange-primary)]">*</span></FormLabel>
                  <Input id="oppCompanyName" value={clientCompanyName} onChange={(e) => setClientCompanyName(e.target.value)} placeholder="Auckland Developments Ltd" className={inputClass} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FormLabel htmlFor="oppEmail">Email</FormLabel>
                    <Input id="oppEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Email@example.com" className={inputClass} />
                  </div>
                  <div>
                    <FormLabel htmlFor="oppPhone">Phone</FormLabel>
                    <Input id="oppPhone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+64 9 123 4567" className={inputClass} />
                  </div>
                </div>
              </>
            ) : null}

            {/* Due Date + Estimated Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel htmlFor="oppDueDate">Tender Due Date <span className="text-[var(--orange-primary)]">*</span></FormLabel>
                <Input id="oppDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} required />
              </div>
              <div>
                <FormLabel htmlFor="oppValue">Estimated Value (NZD)</FormLabel>
                <Input id="oppValue" type="number" min="0" step="100" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="500000" className={inputClass} />
              </div>
            </div>

            {/* Estimator / Owner */}
            <div>
              <FormLabel htmlFor="oppOwner">Estimator / Owner <span className="text-[var(--orange-primary)]">*</span></FormLabel>
              <div className="relative">
                <select id="oppOwner" value={selectedOwnerUserId} onChange={(e) => setSelectedOwnerUserId(e.target.value)} className={selectClass} disabled={isAuthLoading || Boolean(loadError)}>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>

            {loadError || error ? (
              <p className="rounded-[0.6rem] border border-[var(--error-light)] bg-[var(--error-light)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--error)]">{error ?? loadError}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <button type="button" className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`}>
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={!canManageOpportunities || isSubmitting || isAuthLoading || Boolean(loadError)}
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60`}
            >
              {isSubmitting ? "Creating..." : "Create Tender"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
