"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "@/components/app/trade-pack-builder.module.css";
import { interMedium } from "@/lib/fonts";
import {
  updateMasterRetentionClaimDatesAction,
  type MasterRetentionDateEditState,
} from "@/app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions";

type RetentionClaimDateEditingContextValue = {
  editing: boolean;
  editState: MasterRetentionDateEditState | null;
  saving: boolean;
  version: number;
  start: (state: MasterRetentionDateEditState) => void;
  cancel: () => void;
  saved: (state: MasterRetentionDateEditState) => void;
  setSaving: (saving: boolean) => void;
};

export const MASTER_RETENTION_DATE_FORM_ID =
  "master-retention-claim-date-form";

const RetentionClaimDateEditingContext =
  createContext<RetentionClaimDateEditingContextValue | null>(null);

export function RetentionClaimDateEditingProvider(props: {
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] =
    useState<MasterRetentionDateEditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <RetentionClaimDateEditingContext.Provider
      value={{
        editing,
        editState,
        saving,
        version,
        start: (state) => {
          setEditState(state);
          setEditing(true);
          setSaving(false);
        },
        cancel: () => {
          setEditing(false);
          setEditState(null);
          setSaving(false);
        },
        saved: (state) => {
          setEditing(false);
          setEditState(state);
          setSaving(false);
          setVersion((current) => current + 1);
        },
        setSaving,
      }}
    >
      {props.children}
    </RetentionClaimDateEditingContext.Provider>
  );
}

export function useOptionalRetentionClaimDateEditing() {
  return useContext(RetentionClaimDateEditingContext);
}

export function RetentionClaimDateEditingHeaderActions() {
  const editing = useContext(RetentionClaimDateEditingContext);
  if (!editing?.editing) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={editing.saving}
        onClick={editing.cancel}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        form={MASTER_RETENTION_DATE_FORM_ID}
        disabled={editing.saving}
      >
        {editing.saving ? "Saving…" : "Save Claim"}
      </Button>
    </>
  );
}

function displayDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-NZ");
}

export function RetentionClaimSubmittedDateFields(props: {
  retentionClaimId: string;
  claimDate: string;
  dueDate: string;
}) {
  const editing = useContext(RetentionClaimDateEditingContext);
  if (!editing) {
    throw new Error(
      "RetentionClaimSubmittedDateFields requires RetentionClaimDateEditingProvider.",
    );
  }

  const activeClaimDate = editing.editState?.claimDate ?? props.claimDate;
  const activeDueDate = editing.editState?.dueDate ?? props.dueDate;

  return (
    <section
      id="retention-claim-date-section"
      className="scroll-mt-6 border-b border-[var(--border-subtle)] py-5"
    >
      {editing.editing && editing.editState ? (
        <EditableRetentionClaimDates
          retentionClaimId={props.retentionClaimId}
          initialState={editing.editState}
          context={editing}
        />
      ) : (
        <>
          <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
            Claim Period
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={styles.quoteBodyLabel}>Claim Date</label>
              <Input
                value={displayDate(activeClaimDate)}
                disabled
                className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className={styles.quoteBodyLabel}>Due Date</label>
              <Input
                value={displayDate(activeDueDate)}
                disabled
                className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function EditableRetentionClaimDates(props: {
  retentionClaimId: string;
  initialState: MasterRetentionDateEditState;
  context: RetentionClaimDateEditingContextValue;
}) {
  const router = useRouter();
  const [claimDate, setClaimDate] = useState(props.initialState.claimDate);
  const [dueDate, setDueDate] = useState(props.initialState.dueDate);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (props.context.saving) return;
    props.context.setSaving(true);
    setError(null);
    try {
      const result = await updateMasterRetentionClaimDatesAction({
        retentionClaimId: props.retentionClaimId,
        claimDate,
        dueDate,
        optimisticRevision: props.initialState.optimisticRevision,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      props.context.saved(result.dates);
      router.refresh();
    } catch {
      setError("TradesStack could not safely update the Retention Claim dates.");
    } finally {
      props.context.setSaving(false);
    }
  };

  return (
    <form
      id={MASTER_RETENTION_DATE_FORM_ID}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
        Claim Period
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="master-retention-claim-date"
            className={styles.quoteBodyLabel}
          >
            Claim Date
          </label>
          <Input
            id="master-retention-claim-date"
            type="date"
            value={claimDate}
            onChange={(event) => setClaimDate(event.target.value)}
            disabled={props.context.saving}
            required
            className="h-10 rounded-[6px]"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="master-retention-due-date"
            className={styles.quoteBodyLabel}
          >
            Due Date
          </label>
          <Input
            id="master-retention-due-date"
            type="date"
            value={dueDate}
            min={claimDate || undefined}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={props.context.saving}
            required
            className="h-10 rounded-[6px]"
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
