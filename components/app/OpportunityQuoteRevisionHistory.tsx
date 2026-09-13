import Link from "next/link";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  opportunityQuoteDisplayNumber,
  opportunityQuoteSeriesDisplayReference,
} from "@/lib/opportunity-quote-display";

export type OpportunityQuoteRevisionHistoryRow = {
  revision_id: string;
  revision_number: number;
  status: string;
  total_quote_price: number;
  updated_at: string;
};

function statusTone(status: string): "draft" | "pending" | "sent" | "approved" | "overdue" {
  if (status === "Draft") return "draft";
  if (status === "Accepted") return "approved";
  if (status === "Rejected" || status === "Expired") return "overdue";
  if (status === "Sent" || status === "Viewed") return "sent";
  return "pending";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-NZ");
}

export function OpportunityQuoteRevisionHistory({
  opportunitySlug,
  baseQuoteNumber,
  rows,
}: {
  opportunitySlug: string;
  baseQuoteNumber: string;
  rows: OpportunityQuoteRevisionHistoryRow[];
}) {
  if (rows.length === 0) return null;

  const displayReference = opportunityQuoteSeriesDisplayReference(baseQuoteNumber);

  return (
    <OperationalPanel
      title="Previous Revisions"
      contentClassName="p-0"
    >
      <OperationalTable>
        <OperationalTableHeader>
          <OperationalTableRow>
            <OperationalTableHead>Quote</OperationalTableHead>
            <OperationalTableHead>Status</OperationalTableHead>
            <OperationalTableHead>Updated</OperationalTableHead>
            <OperationalTableHead className="text-right">Quoted Amount</OperationalTableHead>
            <OperationalTableHead className="text-right">Action</OperationalTableHead>
          </OperationalTableRow>
        </OperationalTableHeader>
        <OperationalTableBody>
          {rows.map((row) => (
            <OperationalTableRow key={row.revision_id}>
              <OperationalTableCell className="font-semibold">
                {opportunityQuoteDisplayNumber(displayReference, row.revision_number)}
              </OperationalTableCell>
              <OperationalTableCell>
                <StatusBadge status={statusTone(row.status)}>{row.status}</StatusBadge>
              </OperationalTableCell>
              <OperationalTableCell>{formatDate(row.updated_at)}</OperationalTableCell>
              <OperationalTableCell className="text-right font-semibold">
                {formatMoney(row.total_quote_price)}
              </OperationalTableCell>
              <OperationalTableCell className="text-right">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/app/leads-clients/opportunities/${opportunitySlug}/quote/${row.revision_id}`}>
                    Open
                  </Link>
                </Button>
              </OperationalTableCell>
            </OperationalTableRow>
          ))}
        </OperationalTableBody>
      </OperationalTable>
    </OperationalPanel>
  );
}
