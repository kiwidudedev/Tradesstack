"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, FileText, Search, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { getSupplierDisplayName, type OrganizationSupplierRow } from "@/lib/suppliers";
import {
  calculateMatchedInvoiceTotal,
  deriveSupplierInvoiceDisplayStatus,
  formatSupplierInvoiceActivityEventLabel,
  formatMatchStatusLabel,
  formatSupplierInvoiceMatchApprovalStatusLabel,
  getSourceLabel,
  getSupplierInvoiceMatchApprovalStatusClassName,
  getSupplierInvoiceMatchStatusClassName,
  getSupplierInvoiceStatusClassName,
  matchCountsTowardInvoiceTotal,
  SUPPLIER_INVOICE_DOCUMENTS_BUCKET,
  toDateInputValue,
  toDayMonthYearLabel,
  toMoney,
  type SupplierInvoiceActivityEventRow,
  type SupplierInvoiceApprovalStepRow,
  type SupplierInvoiceDocumentRow,
  type SupplierInvoiceLineRow,
  type SupplierInvoicePurchaseOrderMatchRow,
  type SupplierInvoiceRow,
} from "@/lib/supplier-invoices";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type OrganizationProjectRow = Database["public"]["Tables"]["organization_projects"]["Row"];
type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type PurchaseOrderCandidateRow = {
  id: string;
  project_id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  supplier_id: string | null;
  issued_to_label: string | null;
  status: string;
  requested_date: string | null;
  total_purchase_order_price: number | null;
};
type PurchaseOrderMatchDraft = {
  id?: string;
  matchedAmount: string;
  matchStatus: "accepted" | "adjusted";
};
type PurchaseOrderMatchWithContext = SupplierInvoicePurchaseOrderMatchRow & {
  purchaseOrder: PurchaseOrderCandidateRow | null;
  approverName: string | null;
};
type SupplierInvoiceApprovalStepWithMember = SupplierInvoiceApprovalStepRow & {
  approverName: string;
};
type SupplierInvoiceActivityEventWithMember = SupplierInvoiceActivityEventRow & {
  actorName: string;
};

type SupplierInvoiceDetailWorkspaceProps = {
  organizationId: string;
  initialInvoice: SupplierInvoiceRow;
  suppliers: OrganizationSupplierRow[];
  initialLines: SupplierInvoiceLineRow[];
  initialDocuments: SupplierInvoiceDocumentRow[];
  initialMatches: SupplierInvoicePurchaseOrderMatchRow[];
  initialApprovalSteps: SupplierInvoiceApprovalStepRow[];
  initialActivityEvents: SupplierInvoiceActivityEventRow[];
  purchaseOrders: PurchaseOrderCandidateRow[];
  projects: OrganizationProjectRow[];
  costCodes: OrganizationCostCodeRow[];
  organizationMembers: OrganizationMemberRow[];
  canWrite: boolean;
  canReview: boolean;
};

type InvoiceFormState = {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string;
  status: SupplierInvoiceRow["status"];
};

type LineFormState = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  taxAmount: string;
  costCodeId: string;
  projectId: string;
};

type DocumentWithUrl = SupplierInvoiceDocumentRow & {
  signedUrl: string | null;
};

function numberString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePurchaseOrderSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toInvoiceFormState(invoice: SupplierInvoiceRow): InvoiceFormState {
  return {
    supplierId: invoice.supplier_id ?? "",
    invoiceNumber: invoice.invoice_number ?? "",
    invoiceDate: toDateInputValue(invoice.invoice_date),
    dueDate: toDateInputValue(invoice.due_date),
    subtotal: Number(invoice.subtotal ?? 0).toFixed(2),
    taxTotal: Number(invoice.tax_total ?? 0).toFixed(2),
    total: Number(invoice.total ?? 0).toFixed(2),
    notes: invoice.notes ?? "",
    status: invoice.status,
  };
}

function toLineFormState(line: SupplierInvoiceLineRow): LineFormState {
  return {
    id: line.id,
    description: line.description ?? "",
    quantity: Number(line.quantity ?? 0).toString(),
    unitPrice: Number(line.unit_price ?? 0).toFixed(2),
    lineTotal: Number(line.line_total ?? 0).toFixed(2),
    taxAmount: Number(line.tax_amount ?? 0).toFixed(2),
    costCodeId: line.cost_code_id ?? "",
    projectId: line.project_id ?? "",
  };
}

function makeEmptyLine(): LineFormState {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    lineTotal: "0.00",
    taxAmount: "0.00",
    costCodeId: "",
    projectId: "",
  };
}

export function SupplierInvoiceDetailWorkspace({
  organizationId,
  initialInvoice,
  suppliers,
  initialLines,
  initialDocuments,
  initialMatches,
  initialApprovalSteps,
  initialActivityEvents,
  purchaseOrders,
  projects,
  costCodes,
  organizationMembers,
  canWrite,
  canReview,
}: SupplierInvoiceDetailWorkspaceProps) {
  const { session } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [invoice, setInvoice] = useState(initialInvoice);
  const [formState, setFormState] = useState<InvoiceFormState>(() =>
    toInvoiceFormState(initialInvoice)
  );
  const [lines, setLines] = useState<LineFormState[]>(
    initialLines.length > 0 ? initialLines.map(toLineFormState) : []
  );
  const [documents, setDocuments] = useState<DocumentWithUrl[]>(
    initialDocuments.map((document) => ({ ...document, signedUrl: null }))
  );
  const [matches, setMatches] = useState(initialMatches);
  const [approvalSteps, setApprovalSteps] = useState(initialApprovalSteps);
  const [activityEvents, setActivityEvents] = useState(initialActivityEvents);
  const [documentsLoading, setDocumentsLoading] = useState(initialDocuments.length > 0);
  const [documentRefreshNonce, setDocumentRefreshNonce] = useState(0);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const [matchDrafts, setMatchDrafts] = useState<Record<string, PurchaseOrderMatchDraft>>({});
  const [isSavingMatches, setIsSavingMatches] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === (formState.supplierId || null)) ?? null,
    [formState.supplierId, suppliers]
  );
  const memberDirectory = useMemo(
    () => new Map(organizationMembers.map((member) => [member.user_id, member])),
    [organizationMembers]
  );
  const purchaseOrderById = useMemo(
    () => new Map(purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder])),
    [purchaseOrders]
  );
  const matchesWithPurchaseOrders = useMemo<PurchaseOrderMatchWithContext[]>(
    () =>
      matches.map((match) => ({
        ...match,
        purchaseOrder: purchaseOrderById.get(match.purchase_order_id) ?? null,
        approverName: match.approved_by_user_id
          ? memberDirectory.get(match.approved_by_user_id)?.display_name ?? "Unknown reviewer"
          : null,
      })),
    [matches, memberDirectory, purchaseOrderById]
  );
  const matchedTotal = useMemo(() => calculateMatchedInvoiceTotal(matches), [matches]);
  const remainingMatchAmount = Math.max(0, Number(invoice.total ?? 0) - matchedTotal);
  const approvedAllocationTotal = useMemo(
    () =>
      matchesWithPurchaseOrders.reduce((sum, match) => {
        if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "approved") {
          return sum;
        }
        return sum + Number(match.matched_amount ?? 0);
      }, 0),
    [matchesWithPurchaseOrders]
  );
  const disputedAllocationTotal = useMemo(
    () =>
      matchesWithPurchaseOrders.reduce((sum, match) => {
        if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "disputed") {
          return sum;
        }
        return sum + Number(match.matched_amount ?? 0);
      }, 0),
    [matchesWithPurchaseOrders]
  );
  const pendingAllocationTotal = useMemo(
    () =>
      matchesWithPurchaseOrders.reduce((sum, match) => {
        if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "pending") {
          return sum;
        }
        return sum + Number(match.matched_amount ?? 0);
      }, 0),
    [matchesWithPurchaseOrders]
  );
  const activeAllocationCount = useMemo(
    () =>
      matchesWithPurchaseOrders.filter((match) =>
        matchCountsTowardInvoiceTotal(match.match_status)
      ).length,
    [matchesWithPurchaseOrders]
  );
  const displayStatus = useMemo(
    () =>
      deriveSupplierInvoiceDisplayStatus({
        storedStatus: invoice.status,
        invoiceTotal: Number(invoice.total ?? 0),
        activeMatchCount: activeAllocationCount,
        approvedAllocationTotal,
        disputedAllocationTotal,
      }),
    [activeAllocationCount, approvedAllocationTotal, disputedAllocationTotal, invoice.status, invoice.total]
  );
  const approvalStepsWithMembers = useMemo<SupplierInvoiceApprovalStepWithMember[]>(
    () =>
      approvalSteps.map((step) => ({
        ...step,
        approverName: step.approver_user_id
          ? memberDirectory.get(step.approver_user_id)?.display_name ?? "Unknown reviewer"
          : "Pending review",
      })),
    [approvalSteps, memberDirectory]
  );
  const activityEventsWithMembers = useMemo<SupplierInvoiceActivityEventWithMember[]>(
    () =>
      activityEvents.map((event) => ({
        ...event,
        actorName: event.created_by
          ? memberDirectory.get(event.created_by)?.display_name ?? "Unknown member"
          : "System",
      })),
    [activityEvents, memberDirectory]
  );

  useEffect(() => {
    if (initialDocuments.length === 0) {
      setDocuments([]);
      setDocumentsLoading(false);
      return;
    }

    if (!session?.id) {
      setDocuments(initialDocuments.map((document) => ({ ...document, signedUrl: null })));
      setDocumentsLoading(true);
      return;
    }

    let cancelled = false;
    setDocumentsLoading(true);

    void (async () => {
      const nextDocuments = await Promise.all(
        initialDocuments.map(async (document) => {
          const { data, error: signedUrlError } = await supabase.storage
            .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
            .createSignedUrl(document.file_path, 60 * 60);

          return {
            ...document,
            signedUrl: signedUrlError ? null : data?.signedUrl ?? null,
          };
        })
      );

      if (!cancelled) {
        setDocuments(nextDocuments);
        setDocumentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentRefreshNonce, initialDocuments, session?.id, supabase]);

  async function refreshWorkflowState() {
    const [
      { data: refreshedInvoice, error: invoiceRefreshError },
      { data: refreshedMatches, error: matchesRefreshError },
      { data: refreshedApprovalSteps, error: approvalStepsRefreshError },
      { data: refreshedActivityEvents, error: activityEventsRefreshError },
    ] = await Promise.all([
      supabase
        .from("supplier_invoices")
        .select("*")
        .eq("id", invoice.id)
        .eq("organization_id", organizationId)
        .single(),
      supabase
        .from("supplier_invoice_purchase_order_matches")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("supplier_invoice_approval_steps")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("supplier_invoice_activity_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: false }),
    ]);

    if (invoiceRefreshError) {
      throw new Error(invoiceRefreshError.message);
    }
    if (matchesRefreshError) {
      throw new Error(matchesRefreshError.message);
    }
    if (approvalStepsRefreshError) {
      throw new Error(approvalStepsRefreshError.message);
    }
    if (activityEventsRefreshError) {
      throw new Error(activityEventsRefreshError.message);
    }

    if (refreshedInvoice) {
      setInvoice(refreshedInvoice as SupplierInvoiceRow);
      setFormState(toInvoiceFormState(refreshedInvoice as SupplierInvoiceRow));
    }
    setMatches((refreshedMatches ?? []) as SupplierInvoicePurchaseOrderMatchRow[]);
    setApprovalSteps((refreshedApprovalSteps ?? []) as SupplierInvoiceApprovalStepRow[]);
    setActivityEvents((refreshedActivityEvents ?? []) as SupplierInvoiceActivityEventRow[]);
  }

  function buildInitialMatchDrafts() {
    return matches.reduce<Record<string, PurchaseOrderMatchDraft>>((accumulator, match) => {
      if (!matchCountsTowardInvoiceTotal(match.match_status)) {
        return accumulator;
      }

      accumulator[match.purchase_order_id] = {
        id: match.id,
        matchedAmount: Number(match.matched_amount ?? 0).toFixed(2),
        matchStatus: match.match_status === "adjusted" ? "adjusted" : "accepted",
      };
      return accumulator;
    }, {});
  }

  function openMatchDialog() {
    setMatchDrafts(buildInitialMatchDrafts());
    setMatchSearchQuery("");
    setIsMatchDialogOpen(true);
    setError(null);
  }

  const filteredPurchaseOrders = useMemo(() => {
    const query = normalizePurchaseOrderSearchValue(matchSearchQuery);
    const invoiceSupplierId = formState.supplierId || null;

    return [...purchaseOrders]
      .filter((purchaseOrder) => {
        if (!query) {
          return true;
        }

        return [
          purchaseOrder.purchase_order_number,
          purchaseOrder.purchase_order_title,
          purchaseOrder.issued_to_label,
          purchaseOrder.status,
        ].some((value) => normalizePurchaseOrderSearchValue(value).includes(query));
      })
      .sort((left, right) => {
        const leftHasExistingMatch = Boolean(matchDrafts[left.id]?.matchedAmount);
        const rightHasExistingMatch = Boolean(matchDrafts[right.id]?.matchedAmount);
        if (leftHasExistingMatch !== rightHasExistingMatch) {
          return leftHasExistingMatch ? -1 : 1;
        }

        const leftSupplierMatch = invoiceSupplierId && left.supplier_id === invoiceSupplierId;
        const rightSupplierMatch = invoiceSupplierId && right.supplier_id === invoiceSupplierId;
        if (leftSupplierMatch !== rightSupplierMatch) {
          return leftSupplierMatch ? -1 : 1;
        }

        return normalizePurchaseOrderSearchValue(left.purchase_order_number).localeCompare(
          normalizePurchaseOrderSearchValue(right.purchase_order_number)
        );
      });
  }, [formState.supplierId, matchDrafts, matchSearchQuery, purchaseOrders]);

  const draftMatchedTotal = useMemo(
    () =>
      Object.values(matchDrafts).reduce((sum, draft) => {
        if (!matchCountsTowardInvoiceTotal(draft.matchStatus)) {
          return sum;
        }
        return sum + numberString(draft.matchedAmount);
      }, 0),
    [matchDrafts]
  );

  async function saveMatches() {
    if (!canWrite || isSavingMatches) {
      return;
    }
    if (!session?.id) {
      setError("You must be signed in to update invoice matches.");
      return;
    }

    const invoiceTotal = Number(invoice.total ?? 0);
    if (draftMatchedTotal > invoiceTotal + 0.0001) {
      setError("Allocated and adjusted allocation amounts cannot exceed the supplier invoice total.");
      return;
    }

    setIsSavingMatches(true);
    setError(null);
    setMessage(null);

    try {
      const draftEntries = Object.entries(matchDrafts);
      const nextRows = draftEntries
        .map(([purchaseOrderId, draft]) => {
          const baseRow = {
            organization_id: organizationId,
            supplier_invoice_id: invoice.id,
            purchase_order_id: purchaseOrderId,
            matched_amount: Number(numberString(draft.matchedAmount).toFixed(2)),
            match_status: draft.matchStatus,
            confidence_score: null,
            match_basis: "manual" as const,
            created_by: session.id,
          };

          return draft.id
            ? {
                id: draft.id,
                ...baseRow,
              }
            : baseRow;
        })
        .filter((draft) => draft.matched_amount > 0);

      const existingRows = nextRows.filter(
        (row): row is typeof row & { id: string } => "id" in row && typeof row.id === "string"
      );
      const newRows = nextRows.filter(
        (row): row is Omit<typeof row, "id"> => !("id" in row)
      );

      const untouchedRejectedMatches = matches.filter(
        (match) => !matchCountsTowardInvoiceTotal(match.match_status)
      );
      const keptMatchIds = new Set(
        nextRows.map((row) => row.id).filter((value): value is string => Boolean(value))
      );
      const matchIdsToDelete = matches
        .filter(
          (match) =>
            matchCountsTowardInvoiceTotal(match.match_status) && !keptMatchIds.has(match.id)
        )
        .map((match) => match.id);

      if (matchIdsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("supplier_invoice_purchase_order_matches")
          .delete()
          .eq("organization_id", organizationId)
          .eq("supplier_invoice_id", invoice.id)
          .in("id", matchIdsToDelete);

        if (deleteError) {
          throw new Error(deleteError.message);
        }
      }

      if (nextRows.length > 0) {
        const savedMatches: SupplierInvoicePurchaseOrderMatchRow[] = [];

        if (existingRows.length > 0) {
          const { data: upsertedMatches, error: upsertError } = await supabase
            .from("supplier_invoice_purchase_order_matches")
            .upsert(existingRows, {
              onConflict: "supplier_invoice_id,purchase_order_id",
            })
            .select("*");

          if (upsertError) {
            throw new Error(upsertError.message);
          }

          savedMatches.push(
            ...((upsertedMatches ?? []) as SupplierInvoicePurchaseOrderMatchRow[])
          );
        }

        if (newRows.length > 0) {
          const { data: insertedMatches, error: insertError } = await supabase
            .from("supplier_invoice_purchase_order_matches")
            .insert(newRows)
            .select("*");

          if (insertError) {
            throw new Error(insertError.message);
          }

          savedMatches.push(
            ...((insertedMatches ?? []) as SupplierInvoicePurchaseOrderMatchRow[])
          );
        }

        const savedPurchaseOrderIds = new Set(savedMatches.map((match) => match.purchase_order_id));
        setMatches([
          ...savedMatches,
          ...untouchedRejectedMatches.filter(
            (match) => !savedPurchaseOrderIds.has(match.purchase_order_id)
          ),
        ]);
      } else {
        setMatches(untouchedRejectedMatches);
      }

      await refreshWorkflowState();
      setIsMatchDialogOpen(false);
      setMessage("Purchase order matches updated.");
    } catch (saveMatchesError) {
      setError(
        saveMatchesError instanceof Error
          ? saveMatchesError.message
          : "Unable to update purchase order matches."
      );
    } finally {
      setIsSavingMatches(false);
    }
  }

  async function updateMatchStatus(matchId: string, nextStatus: "rejected") {
    setError(null);
    setMessage(null);

    try {
      const { data: updatedMatch, error: updateError } = await supabase
        .from("supplier_invoice_purchase_order_matches")
        .update({ match_status: nextStatus })
        .eq("id", matchId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (updateError || !updatedMatch) {
        throw new Error(updateError?.message ?? "Unable to update match.");
      }

      setMatches((current) =>
        current.map((match) => (match.id === matchId ? (updatedMatch as SupplierInvoicePurchaseOrderMatchRow) : match))
      );
      await refreshWorkflowState();
      setMessage("Purchase order match updated.");
    } catch (updateMatchError) {
      setError(updateMatchError instanceof Error ? updateMatchError.message : "Unable to update match.");
    }
  }

  async function removeMatch(matchId: string) {
    setError(null);
    setMessage(null);

    try {
      const { error: deleteError } = await supabase
        .from("supplier_invoice_purchase_order_matches")
        .delete()
        .eq("id", matchId)
        .eq("organization_id", organizationId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setMatches((current) => current.filter((match) => match.id !== matchId));
      await refreshWorkflowState();
      setMessage("Purchase order match removed.");
    } catch (deleteMatchError) {
      setError(deleteMatchError instanceof Error ? deleteMatchError.message : "Unable to remove match.");
    }
  }

  async function saveInvoice(nextStatus?: SupplierInvoiceRow["status"]) {
    if (!canWrite || isSaving) {
      return;
    }
    if (!session?.id) {
      setError("You must be signed in to update this invoice.");
      return;
    }

    const statusToPersist = nextStatus ?? formState.status;
    if (
      (statusToPersist === "Approved" || statusToPersist === "Disputed") &&
      !canReview
    ) {
      setError("You do not have permission to review this invoice.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextInvoiceTotal = numberString(formState.total);
      if (matchedTotal > nextInvoiceTotal + 0.0001) {
        throw new Error("Invoice total cannot be less than the allocated purchase order amounts.");
      }

      const { data: updatedInvoice, error: invoiceError } = await supabase
        .from("supplier_invoices")
        .update({
          supplier_id: formState.supplierId || null,
          invoice_number: formState.invoiceNumber.trim(),
          invoice_date: formState.invoiceDate || null,
          due_date: formState.dueDate || null,
          subtotal: numberString(formState.subtotal),
          tax_total: numberString(formState.taxTotal),
          total: nextInvoiceTotal,
          notes: formState.notes.trim(),
          status: statusToPersist,
        })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (invoiceError || !updatedInvoice) {
        throw new Error(invoiceError?.message ?? "Unable to update invoice.");
      }

      const { error: deleteLinesError } = await supabase
        .from("supplier_invoice_lines")
        .delete()
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id);

      if (deleteLinesError) {
        throw new Error(deleteLinesError.message);
      }

      if (lines.length > 0) {
        const { error: insertLinesError } = await supabase
          .from("supplier_invoice_lines")
          .insert(
            lines.map((line, index) => ({
              organization_id: organizationId,
              supplier_invoice_id: invoice.id,
              description: line.description.trim(),
              quantity: numberString(line.quantity),
              unit_price: numberString(line.unitPrice),
              line_total: numberString(line.lineTotal),
              tax_amount: numberString(line.taxAmount),
              cost_code_id: line.costCodeId || null,
              project_id: line.projectId || null,
              sort_order: index,
            }))
          );

        if (insertLinesError) {
          throw new Error(insertLinesError.message);
        }
      }

      const autoReReviewed =
        invoice.status === "Approved" && updatedInvoice.status === "Needs Review";

      setInvoice(updatedInvoice);
      setFormState(toInvoiceFormState(updatedInvoice));
      await refreshWorkflowState();
      setMessage(
        autoReReviewed
          ? "Material changes sent this invoice back to Needs Review."
          : nextStatus
          ? `Invoice marked ${nextStatus}.`
          : "Supplier invoice updated."
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  const primaryDocument = documents[0] ?? null;

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="space-y-4 pt-[25px]">
        <div className="flex items-center">
          <Link
            href="/app/company/supplier-invoices"
            className={`${ibmPlexSans.className} inline-flex items-center gap-[0.4rem] rounded-[0.576rem] border border-[#CBD5E1] bg-white px-4 py-2 text-[14px] font-medium text-[#475569] shadow-none transition hover:bg-[#F8FAFC]`}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Supplier Invoices
          </Link>
        </div>

        <div className="rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <div className="p-[1.35rem_1.5rem_1.2rem]">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className={`${ibmPlexSans.className} m-0 text-[clamp(1.32rem,2.15vw,1.92rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]`}>
                    {invoice.invoice_number || "Supplier Invoice"}
                  </h1>
                  <span
                    className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap ${getSupplierInvoiceStatusClassName(displayStatus)}`}
                  >
                    {displayStatus}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <span className={`${ibmPlexSans.className} inline-flex items-center gap-2 text-[14px] font-medium text-[#4B5D79]`}>
                    <FileText className="h-4 w-4" strokeWidth={2.1} />
                    <span>{selectedSupplier ? getSupplierDisplayName(selectedSupplier) : "Unassigned supplier"}</span>
                  </span>
                  <span className={`${ibmPlexSans.className} inline-flex items-center gap-2 text-[14px] font-medium text-[#4B5D79]`}>
                    <Upload className="h-4 w-4" strokeWidth={2.1} />
                    <span>{getSourceLabel(invoice.source)}</span>
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className={`${ibmPlexSans.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6A7A89]`}>
                  Total
                </p>
                <p className={`${ibmPlexSans.className} mt-1 text-[1.8rem] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>
                  {toMoney(Number(formState.total))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div className={`${interMedium.className} rounded-[10px] border border-[#CDE9DA] bg-[#EAF8F1] px-4 py-3 text-sm text-[#166534]`}>
          {message}
        </div>
      ) : null}

      {error ? (
        <div className={`${interMedium.className} rounded-[10px] border border-[#F5C2C7] bg-[#FFF1F2] px-4 py-3 text-sm text-[#B42318]`}>
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F1] px-6 py-5">
              <div className="space-y-1">
                <p className={`${ibmPlexSans.className} text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                  Invoice Details
                </p>
                <p className={`${interMedium.className} text-[14px] leading-[1.45] text-[#6A7A89]`}>
                  Manage the supplier invoice record, dates, totals, and notes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveInvoice()}
                disabled={!canWrite || isSaving}
                className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
            <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Supplier
                </label>
                <select
                  value={formState.supplierId}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, supplierId: event.target.value }))
                  }
                  disabled={!canWrite}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {getSupplierDisplayName(supplier)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Invoice Number
                </label>
                <Input
                  value={formState.invoiceNumber}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      invoiceNumber: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Subtotal
                  </label>
                  <Input
                    inputMode="decimal"
                    value={formState.subtotal}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        subtotal: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                  />
                </div>
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Tax
                  </label>
                  <Input
                    inputMode="decimal"
                    value={formState.taxTotal}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        taxTotal: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                  />
                </div>
              </div>
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Invoice Date
                </label>
                <Input
                  type="date"
                  value={formState.invoiceDate}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      invoiceDate: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                />
              </div>
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Due Date
                </label>
                <Input
                  type="date"
                  value={formState.dueDate}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                />
              </div>
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Total
                </label>
                <Input
                  inputMode="decimal"
                  value={formState.total}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      total: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                />
              </div>
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Source
                </label>
                <div className={`${ibmPlexSans.className} flex h-[2.75rem] items-center rounded-[0.6rem] border border-[#E2E8F1] bg-[#F8FAFC] px-3.5 text-[14px] font-medium text-[#475569]`}>
                  {getSourceLabel(invoice.source)}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Notes
                </label>
                <textarea
                  rows={4}
                  value={formState.notes}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, notes: event.target.value }))
                  }
                  disabled={!canWrite}
                  className={`${ibmPlexSans.className} w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#E2E8F1] px-6 py-5">
              <div className="space-y-1">
                <p className={`${ibmPlexSans.className} text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                  Document
                </p>
                <p className={`${interMedium.className} text-[14px] leading-[1.45] text-[#6A7A89]`}>
                  Review the uploaded invoice alongside the details and line items.
                </p>
              </div>
            </div>
            <div className="space-y-4 px-6 py-6">
              {primaryDocument ? (
                <>
                  <div className="space-y-1">
                    <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                      {primaryDocument.file_name}
                    </p>
                    <p className={`${interMedium.className} text-[13px] text-[#6A7A89]`}>
                      {primaryDocument.mime_type || "Unknown type"}
                      {primaryDocument.size_bytes
                        ? ` · ${(primaryDocument.size_bytes / (1024 * 1024)).toFixed(2)} MB`
                        : ""}
                    </p>
                  </div>
                  {documentsLoading ? (
                    <p className={`${interMedium.className} text-[14px] text-[#6A7A89]`}>
                      Loading document preview...
                    </p>
                  ) : primaryDocument.signedUrl ? (
                    <>
                      {primaryDocument.mime_type?.includes("pdf") ? (
                        <iframe
                          src={primaryDocument.signedUrl}
                          title={primaryDocument.file_name}
                          className="h-[480px] w-full rounded-[12px] border border-[#E2E8F1] bg-white"
                        />
                      ) : primaryDocument.mime_type?.startsWith("image/") ? (
                        <Image
                          src={primaryDocument.signedUrl}
                          alt={primaryDocument.file_name}
                          width={1400}
                          height={1800}
                          unoptimized
                          className="max-h-[480px] w-full rounded-[12px] border border-[#E2E8F1] bg-white object-contain"
                        />
                      ) : null}
                      <a
                        href={primaryDocument.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                      >
                        Download document
                      </a>
                    </>
                  ) : (
                    <div className="space-y-3 rounded-[12px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-5 py-5">
                      <p className={`${interMedium.className} text-[14px] text-[#6A7A89]`}>
                        Document preview unavailable right now.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDocumentsLoading(true);
                          setDocuments(initialDocuments.map((document) => ({ ...document, signedUrl: null })));
                          setDocumentRefreshNonce((current) => current + 1);
                        }}
                        className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                      >
                        Retry preview
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                    No document uploaded yet.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F1] px-6 py-5">
              <p className={`${ibmPlexSans.className} text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                Line Items
              </p>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => setLines((current) => [...current, makeEmptyLine()])}
                  className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                >
                  Add Line
                </button>
              ) : null}
            </div>
            <div className="space-y-4 px-6 py-6">
              {lines.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                    No line items added yet.
                  </p>
                </div>
              ) : (
                lines.map((line, index) => (
                  <div
                    key={line.id}
                    className="space-y-4 rounded-[12px] border border-[#E2E8F1] bg-[#FCFDFE] p-4"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[#E7EEF5] pb-3">
                      <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                        Line {index + 1}
                      </p>
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLines((current) => current.filter((item) => item.id !== line.id))
                          }
                          className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#B42318]`}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div>
                      <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                        Description
                      </label>
                      <Input
                        value={line.description}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, description: event.target.value }
                                : item
                            )
                          )
                        }
                        disabled={!canWrite}
                        className={`${ibmPlexSans.className} h-[2.9rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        ["Quantity", line.quantity, "quantity"],
                        ["Unit Price", line.unitPrice, "unitPrice"],
                        ["Line Total", line.lineTotal, "lineTotal"],
                        ["Tax", line.taxAmount, "taxAmount"],
                      ].map(([label, value, key]) => (
                        <div key={key}>
                          <label className={`${ibmPlexSans.className} mb-1 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                            {label}
                          </label>
                          <Input
                            inputMode="decimal"
                            value={value}
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((item) =>
                                  item.id === line.id
                                    ? { ...item, [key]: event.target.value }
                                    : item
                                )
                              )
                            }
                            disabled={!canWrite}
                            className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                          Cost Code
                        </label>
                        <select
                          value={line.costCodeId}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === line.id
                                  ? { ...item, costCodeId: event.target.value }
                                  : item
                              )
                            )
                          }
                          disabled={!canWrite}
                          className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                        >
                          <option value="">Select cost code</option>
                          {costCodes.map((costCode) => (
                            <option key={costCode.id} value={costCode.id}>
                              {costCode.code} · {costCode.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                          Project
                        </label>
                        <select
                          value={line.projectId}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === line.id
                                  ? { ...item, projectId: event.target.value }
                                  : item
                              )
                            )
                          }
                          disabled={!canWrite}
                          className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                        >
                          <option value="">Select project</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            <div className="space-y-4 border-b border-[#E2E8F1] px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className={`${ibmPlexSans.className} text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                    Purchase Order Matching
                  </p>
                  <p className={`${interMedium.className} text-[13px] leading-[1.45] text-[#6A7A89]`}>
                    Match this invoice to purchase orders and monitor allocation approval.
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={openMatchDialog}
                    className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] bg-[#0B2739] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#081D2B]`}
                  >
                    Match to Purchase Orders
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ["Matched", toMoney(matchedTotal)],
                  ["Remaining", toMoney(remainingMatchAmount)],
                  ["Approved", toMoney(approvedAllocationTotal)],
                  ["Pending / Disputed", `${toMoney(pendingAllocationTotal)} / ${toMoney(disputedAllocationTotal)}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-[#E2E8F1] bg-[#FCFDFE] px-4 py-3">
                    <p className={`${ibmPlexSans.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      {label}
                    </p>
                    <p className={`${ibmPlexSans.className} mt-1 text-[14px] font-semibold text-[#10283B]`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4 px-6 py-6">
              <p className={`${interMedium.className} text-[12px] leading-[1.45] text-[#6A7A89]`}>
                QS and PM approval happens inside the matched purchase order. This view tracks the current allocation state.
              </p>
              {matchesWithPurchaseOrders.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                    No purchase orders linked yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {matchesWithPurchaseOrders.map((match) => (
                    <div
                      key={match.id}
                      className="space-y-3 rounded-[12px] border border-[#E2E8F1] bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                              {match.purchaseOrder?.purchase_order_number || "Purchase Order"}
                            </p>
                            <span
                              className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSupplierInvoiceMatchApprovalStatusClassName(match.approval_status)}`}
                            >
                              {formatSupplierInvoiceMatchApprovalStatusLabel(match.approval_status)}
                            </span>
                          </div>
                          <p className={`${ibmPlexSans.className} text-[14px] text-[#4B5D79]`}>
                            {match.purchaseOrder?.purchase_order_title || "Untitled purchase order"}
                          </p>
                          <p className={`${interMedium.className} text-[12px] text-[#6A7A89]`}>
                            {match.purchaseOrder?.issued_to_label?.trim() || "Unassigned supplier"} · {toDayMonthYearLabel(match.purchaseOrder?.requested_date ?? null)}
                          </p>
                          <p className={`${interMedium.className} text-[12px] text-[#6A7A89]`}>
                            {match.approverName
                              ? `${match.approverName}${match.approved_at ? ` · ${toDayMonthYearLabel(match.approved_at)}` : ""}`
                              : "Waiting for QS / PM review on the purchase order page"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                            {toMoney(Number(match.matched_amount ?? 0))}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                            <span
                              className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSupplierInvoiceMatchStatusClassName(match.match_status)}`}
                            >
                              {formatMatchStatusLabel(match.match_status)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {match.approval_notes?.trim() ? (
                        <p className={`${interMedium.className} text-[12px] leading-[1.45] text-[#4B5D79]`}>
                          {match.approval_notes}
                        </p>
                      ) : null}
                      {canWrite ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openMatchDialog}
                            className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                          >
                            Edit
                          </button>
                          {match.match_status !== "rejected" ? (
                            <button
                              type="button"
                              onClick={() => void updateMatchStatus(match.id, "rejected")}
                              className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#F5C2C7] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#B42318] transition hover:bg-[#FFF1F2]`}
                            >
                              Reject
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void removeMatch(match.id)}
                            className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {approvalStepsWithMembers.length > 0 ? (
        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F1] px-6 py-5">
              <div className="space-y-1">
                <p className={`${ibmPlexSans.className} text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                  Legacy Review History
                </p>
                <p className={`${interMedium.className} text-[14px] leading-[1.45] text-[#6A7A89]`}>
                  Earlier invoice-level decisions are kept here for reference only.
                </p>
              </div>
              <span className={`${interMedium.className} text-[13px] text-[#6A7A89]`}>
                {approvalStepsWithMembers.length} decision{approvalStepsWithMembers.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-3 px-6 py-6">
              {approvalStepsWithMembers.map((step) => (
                <div
                  key={step.id}
                  className="rounded-[12px] border border-[#E2E8F1] bg-[#FCFDFE] px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                        {step.approverName}
                        {step.approver_role ? ` · ${step.approver_role.replaceAll("_", " ")}` : ""}
                      </p>
                      <p className={`${interMedium.className} mt-1 text-[13px] text-[#6A7A89]`}>
                        {step.decided_at ? toDayMonthYearLabel(step.decided_at) : "Pending"}
                      </p>
                    </div>
                    <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full bg-[#F1F5F9] px-3 py-1 text-[12px] font-semibold text-[#475569]`}>
                      {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                    </span>
                  </div>
                  {step.decision_notes ? (
                    <p className={`${interMedium.className} mt-3 text-[13px] leading-[1.45] text-[#4B5D79]`}>
                      {step.decision_notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
        <CardContent className="p-0">
          <div className="border-b border-[#E2E8F1] px-6 py-5">
            <div className="space-y-1">
              <p className={`${ibmPlexSans.className} text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                Activity Timeline
              </p>
              <p className={`${interMedium.className} text-[14px] leading-[1.45] text-[#6A7A89]`}>
                A record of invoice updates, workflow changes, and review activity.
              </p>
            </div>
          </div>
          <div className="space-y-3 px-6 py-6">
            {activityEventsWithMembers.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                  No activity yet.
                </p>
              </div>
            ) : (
              activityEventsWithMembers.map((event) => (
                <div
                  key={event.id}
                  className="rounded-[12px] border border-[#E2E8F1] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                        {formatSupplierInvoiceActivityEventLabel(event.event_type)}
                      </p>
                      <p className={`${interMedium.className} text-[14px] leading-[1.45] text-[#4B5D79]`}>
                        {event.message}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#475569]`}>
                        {event.actorName}
                      </p>
                      <p className={`${interMedium.className} mt-1 text-[12px] text-[#6A7A89]`}>
                        {new Date(event.created_at).toLocaleString("en-NZ", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isMatchDialogOpen}
        onOpenChange={(open) => {
          setIsMatchDialogOpen(open);
          if (open) {
            setMatchDrafts(buildInitialMatchDrafts());
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-full max-w-[880px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
          <div className="px-7 pb-6 pt-7">
            <h2
              className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}
            >
              Match to Purchase Orders
            </h2>
          </div>

          <div className="space-y-4 px-7 pb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] p-4">
                <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#6A7A89]`}>
                  Invoice Total
                </p>
                <p className={`${ibmPlexSans.className} mt-1 text-[15px] font-semibold text-[#10283B]`}>
                  {toMoney(Number(invoice.total ?? 0))}
                </p>
              </div>
              <div className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] p-4">
                <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#6A7A89]`}>
                  Draft Matched Total
                </p>
                <p className={`${ibmPlexSans.className} mt-1 text-[15px] font-semibold text-[#10283B]`}>
                  {toMoney(draftMatchedTotal)}
                </p>
              </div>
              <div className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] p-4">
                <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#6A7A89]`}>
                  Remaining Amount
                </p>
                <p className={`${ibmPlexSans.className} mt-1 text-[15px] font-semibold text-[#10283B]`}>
                  {toMoney(Math.max(0, Number(invoice.total ?? 0) - draftMatchedTotal))}
                </p>
              </div>
            </div>

            <div className="flex h-[42px] items-center gap-2 rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3">
              <Search className="h-4 w-4 text-[#9AAAB8]" />
              <input
                type="text"
                value={matchSearchQuery}
                onChange={(event) => setMatchSearchQuery(event.target.value)}
                placeholder="Search purchase orders..."
                className={`${ibmPlexSans.className} h-full flex-1 border-0 bg-transparent text-[14px] text-[#1d1d1d] outline-none placeholder:text-[#9AAAB8]`}
              />
            </div>

            <div className="space-y-3">
              {filteredPurchaseOrders.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                    No purchase orders match this search.
                  </p>
                </div>
              ) : (
                filteredPurchaseOrders.map((purchaseOrder) => {
                  const draft = matchDrafts[purchaseOrder.id] ?? {
                    matchedAmount: "",
                    matchStatus: "accepted" as const,
                  };
                  const matchesSupplier =
                    Boolean(formState.supplierId) && purchaseOrder.supplier_id === formState.supplierId;

                  return (
                    <div
                      key={purchaseOrder.id}
                      className="space-y-3 rounded-[12px] border border-[#E2E8F1] bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                              {purchaseOrder.purchase_order_number}
                            </p>
                            {matchesSupplier ? (
                              <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full bg-[#EAF8F1] px-2.5 py-1 text-[12px] font-semibold text-[#166534]`}>
                                Same supplier
                              </span>
                            ) : null}
                          </div>
                          <p className={`${ibmPlexSans.className} text-[14px] text-[#4B5D79]`}>
                            {purchaseOrder.purchase_order_title || "Untitled purchase order"}
                          </p>
                          <p className={`${ibmPlexSans.className} text-[13px] text-[#6A7A89]`}>
                            {purchaseOrder.issued_to_label?.trim() || "Unassigned supplier"} · {purchaseOrder.status} · {toDayMonthYearLabel(purchaseOrder.requested_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#6A7A89]`}>
                            PO Total
                          </p>
                          <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                            {toMoney(Number(purchaseOrder.total_purchase_order_price ?? 0))}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_170px]">
                        <div>
                          <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                            Matched Amount
                          </label>
                          <Input
                            inputMode="decimal"
                            value={draft.matchedAmount}
                            onChange={(event) =>
                              setMatchDrafts((current) => ({
                                ...current,
                                [purchaseOrder.id]: {
                                  id: current[purchaseOrder.id]?.id,
                                  matchedAmount: event.target.value,
                                  matchStatus: current[purchaseOrder.id]?.matchStatus ?? "accepted",
                                },
                              }))
                            }
                            placeholder="0.00"
                            className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
                          />
                        </div>
                        <div>
                          <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                            Allocation Status
                          </label>
                          <select
                            value={draft.matchStatus}
                            onChange={(event) =>
                              setMatchDrafts((current) => ({
                                ...current,
                                [purchaseOrder.id]: {
                                  id: current[purchaseOrder.id]?.id,
                                  matchedAmount: current[purchaseOrder.id]?.matchedAmount ?? "",
                                  matchStatus: event.target.value as "accepted" | "adjusted",
                                },
                              }))
                            }
                            className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                          >
                            <option value="accepted">Allocated</option>
                            <option value="adjusted">Adjusted Allocation</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() =>
                              setMatchDrafts((current) => {
                                const next = { ...current };
                                delete next[purchaseOrder.id];
                                return next;
                              })
                            }
                            className={`${ibmPlexSans.className} inline-flex h-[2.75rem] items-center justify-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-4 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <button
                type="button"
                className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => void saveMatches()}
              disabled={!canWrite || isSavingMatches}
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isSavingMatches ? "Saving..." : "Save Matches"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
