"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  TenderClientMultiSelect,
  withPrimaryTenderClient,
  type TenderClientOption,
} from "@/components/app/TenderClientMultiSelect";

const SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const LABEL_CLASS = "self-center text-sm font-medium text-[var(--text-primary)]";

type OpportunityLeadDetailsFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  clients: TenderClientOption[];
  initialPrimaryClientId: string;
  initialTenderClientIds: string[];
  projectName: string;
  location: string;
  dueDate: string;
  createdAtLabel: string;
};

export function OpportunityLeadDetailsForm({
  action,
  clients,
  initialPrimaryClientId,
  initialTenderClientIds,
  projectName,
  location,
  dueDate,
  createdAtLabel,
}: OpportunityLeadDetailsFormProps) {
  const [primaryClientId, setPrimaryClientId] = useState(initialPrimaryClientId);
  const [tenderClientIds, setTenderClientIds] = useState(() =>
    withPrimaryTenderClient(initialTenderClientIds, initialPrimaryClientId),
  );

  return (
    <form id="opportunity-details-form" action={action} className="lead-details-edit-form hidden">
      {tenderClientIds.map((clientId) => (
        <input key={clientId} type="hidden" name="tenderClientIds" value={clientId} />
      ))}
      <div className="grid gap-x-5 gap-y-3.5 md:grid-cols-[160px_minmax(0,1fr)]">
        <label className={LABEL_CLASS} htmlFor="opportunity-projectName">Project Name:</label>
        <Input id="opportunity-projectName" name="projectName" defaultValue={projectName} required />

        <label className={LABEL_CLASS} htmlFor="opportunity-primaryClientId">Primary Client:</label>
        <select
          id="opportunity-primaryClientId"
          name="primaryClientId"
          value={primaryClientId}
          onChange={(event) => {
            const nextPrimaryClientId = event.target.value;
            setPrimaryClientId(nextPrimaryClientId);
            setTenderClientIds((current) => withPrimaryTenderClient(current, nextPrimaryClientId));
          }}
          className={SELECT_CLASS}
          required
        >
          <option value="">Select a client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.company_name?.trim() || client.name || "Unknown Company"}
            </option>
          ))}
        </select>

        <label className={LABEL_CLASS} htmlFor="opportunity-tenderClientIds">Tender Clients:</label>
        <TenderClientMultiSelect
          id="opportunity-tenderClientIds"
          clients={clients}
          selectedIds={tenderClientIds}
          primaryClientId={primaryClientId}
          onChange={setTenderClientIds}
        />

        <label className={LABEL_CLASS} htmlFor="opportunity-location">Location:</label>
        <Input id="opportunity-location" name="location" defaultValue={location} />

        <label className={LABEL_CLASS} htmlFor="opportunity-dueDate">Lead Due Date:</label>
        <Input id="opportunity-dueDate" type="date" name="dueDate" defaultValue={dueDate} />

        <p className={LABEL_CLASS}>Created:</p>
        <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 text-sm text-[var(--text-secondary)]">
          {createdAtLabel}
        </div>
      </div>
    </form>
  );
}
