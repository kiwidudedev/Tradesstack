"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { OpportunityQuoteRegisterStatus } from "@/components/app/OpportunityQuoteRegisterStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  opportunityQuoteDisplayNumber,
  opportunityQuoteRevisionLabel,
  opportunityQuoteSeriesDisplayReference,
} from "@/lib/opportunity-quote-display";

interface PrimaryQuoteSummary {
  id: string;
  status: string;
  total_quote_price: number;
  updated_at: string;
}

interface TenderClientQuoteRow {
  tender_client_id: string | null;
  client_id: string | null;
  client_name: string;
  is_primary: boolean;
  is_tender_client: boolean;
  series_id: string | null;
  base_quote_number: string | null;
  display_reference: string | null;
  current_revision_id: string | null;
  revision_number: number | null;
  status: string | null;
  total_quote_price: number | null;
  updated_at: string | null;
  source_changed_since_distribution: boolean;
}

interface WorkspaceRow {
  primary_quote: PrimaryQuoteSummary | null;
  tender_clients: TenderClientQuoteRow[];
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-NZ");
}

export function OpportunityQuoteRegister() {
  const router = useRouter();
  const opportunity = useOpportunityWorkspaceData();
  const { session, isLoading: authLoading } = useAuth();
  const [primaryQuote, setPrimaryQuote] = useState<PrimaryQuoteSummary | null>(null);
  const [rows, setRows] = useState<TenderClientQuoteRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingClientId, setCreatingClientId] = useState<string | null>(null);
  const [creatingRevisionId, setCreatingRevisionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const fetchWorkspace = useCallback(async (organizationId: string) => {
    const rpc = supabase as unknown as {
      rpc(name: "get_opportunity_quotation_workspace_v1", args: { p_organization_id: string; p_opportunity_id: string }): Promise<{ data: WorkspaceRow[] | null; error: { message: string } | null }>;
    };
    const result = await rpc.rpc("get_opportunity_quotation_workspace_v1", {
      p_organization_id: organizationId,
      p_opportunity_id: opportunity.opportunityId,
    });
    return result;
  }, [opportunity.opportunityId, supabase]);

  useEffect(() => {
    const organizationId = session?.organizationId;
    if (authLoading || !organizationId) return;
    let cancelled = false;
    const load = async () => {
      const result = await fetchWorkspace(organizationId);
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setPrimaryQuote(result.data?.[0]?.primary_quote ?? null);
      setRows(result.data?.[0]?.tender_clients ?? []);
    };
    void load();
    return () => { cancelled = true; };
  }, [authLoading, fetchWorkspace, session?.organizationId]);

  const createClientQuote = async (clientId: string) => {
    if (!session?.organizationId) return;
    setCreatingClientId(clientId);
    setError(null);
    const rpc = supabase as unknown as {
      rpc(name: "create_opportunity_quote_series_v1", args: { p_organization_id: string; p_opportunity_id: string; p_recipient_client_id: string }): Promise<{ data: Array<{ revision_id: string }> | null; error: { message: string } | null }>;
    };
    const result = await rpc.rpc("create_opportunity_quote_series_v1", {
      p_organization_id: session.organizationId,
      p_opportunity_id: opportunity.opportunityId,
      p_recipient_client_id: clientId,
    });
    setCreatingClientId(null);
    const revisionId = result.data?.[0]?.revision_id;
    if (result.error || !revisionId) {
      setError(result.error?.message ?? "The client quotation was not created.");
      return;
    }
    router.push(`/app/leads-clients/opportunities/${opportunity.slug}/quote/${revisionId}`);
  };

  const createRevision = async (revisionId: string) => {
    if (!session?.organizationId) return;
    setCreatingRevisionId(revisionId);
    setError(null);
    const rpc = supabase as unknown as {
      rpc(name: "create_opportunity_quote_revision_v1", args: {
        p_organization_id: string;
        p_opportunity_id: string;
        p_predecessor_quote_id: string;
      }): Promise<{ data: Array<{ revision_id: string }> | null; error: { message: string } | null }>;
    };
    const result = await rpc.rpc("create_opportunity_quote_revision_v1", {
      p_organization_id: session.organizationId,
      p_opportunity_id: opportunity.opportunityId,
      p_predecessor_quote_id: revisionId,
    });
    setCreatingRevisionId(null);
    const createdRevisionId = result.data?.[0]?.revision_id;
    if (result.error || !createdRevisionId) {
      setError(result.error?.message ?? "Unable to create the quote revision.");
      return;
    }
    router.push(`/app/leads-clients/opportunities/${opportunity.slug}/quote/${createdRevisionId}`);
  };

  const filteredRows = rows.filter((row) => {
    const needle = search.trim().toLowerCase();
    return !needle || row.client_name.toLowerCase().includes(needle) || (row.display_reference ?? "").toLowerCase().includes(needle);
  });
  return (
    <div className="space-y-6">
      <OperationalModuleHeader
        title="Quotations"
      />
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <OperationalPanel
        title="Client Quotations"
        contentClassName="p-0"
        actions={(
          <div className="relative w-64 sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients or quotes" className="pl-9" />
          </div>
        )}
      >
        <OperationalTable>
          <OperationalTableHeader>
            <OperationalTableRow>
              <OperationalTableHead>Client</OperationalTableHead>
              <OperationalTableHead>Quote</OperationalTableHead>
              <OperationalTableHead>Revision</OperationalTableHead>
              <OperationalTableHead>Status</OperationalTableHead>
              <OperationalTableHead>Updated</OperationalTableHead>
              <OperationalTableHead className="text-right">Quoted Amount</OperationalTableHead>
              <OperationalTableHead className="text-right">Action</OperationalTableHead>
            </OperationalTableRow>
          </OperationalTableHeader>
          <OperationalTableBody>
            {!loading && filteredRows.length === 0 ? (
              <OperationalTableRow>
                <OperationalTableCell colSpan={7} className="py-10 text-center text-[var(--text-secondary)]">No Tender Clients match this search.</OperationalTableCell>
              </OperationalTableRow>
            ) : filteredRows.map((row) => (
              <OperationalTableRow
                key={row.tender_client_id ?? row.series_id}
                className={row.current_revision_id ? "cursor-pointer" : undefined}
                onClick={() => row.current_revision_id && router.push(`/app/leads-clients/opportunities/${opportunity.slug}/quote/${row.current_revision_id}`)}
              >
                <OperationalTableCell>
                  <div className="font-medium">{row.client_name}</div>
                  {!row.is_tender_client ? <div className="text-xs text-amber-700">Historical recipient needs reconciliation</div> : null}
                </OperationalTableCell>
                <OperationalTableCell className="font-semibold">
                  {row.revision_number
                    ? opportunityQuoteDisplayNumber(
                        opportunityQuoteSeriesDisplayReference(row.base_quote_number, row.display_reference ?? "OPP"),
                        row.revision_number,
                      )
                    : "Not created"}
                </OperationalTableCell>
                <OperationalTableCell>{row.revision_number ? opportunityQuoteRevisionLabel(row.revision_number) : "—"}</OperationalTableCell>
                <OperationalTableCell>
                  <OpportunityQuoteRegisterStatus status={row.status} sourceChanged={row.source_changed_since_distribution} />
                </OperationalTableCell>
                <OperationalTableCell>{formatDate(row.updated_at)}</OperationalTableCell>
                <OperationalTableCell className="text-right font-semibold">{row.series_id ? formatMoney(row.total_quote_price) : "—"}</OperationalTableCell>
                <OperationalTableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                  {row.current_revision_id ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/app/leads-clients/opportunities/${opportunity.slug}/quote/${row.current_revision_id}`)}>Open</Button>
                      {row.status && row.status !== "Draft" ? (
                        <Button size="sm" disabled={creatingRevisionId === row.current_revision_id} onClick={() => void createRevision(row.current_revision_id!)}>
                          {creatingRevisionId === row.current_revision_id ? "Creating..." : "Create Revision"}
                        </Button>
                      ) : null}
                    </div>
                  ) : row.client_id && row.is_tender_client ? (
                    <Button size="sm" disabled={(!row.is_primary && !primaryQuote) || creatingClientId === row.client_id} onClick={() => void createClientQuote(row.client_id!)}>
                      {creatingClientId === row.client_id ? "Creating..." : "Create Quote"}
                    </Button>
                  ) : "—"}
                </OperationalTableCell>
              </OperationalTableRow>
            ))}
          </OperationalTableBody>
        </OperationalTable>
      </OperationalPanel>
    </div>
  );
}
