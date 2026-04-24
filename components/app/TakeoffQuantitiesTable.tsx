import { ibmPlexSans } from "@/lib/fonts";
import { Card, CardContent } from "@/components/ui/card";
import type { QuantityTableRow } from "@/lib/takeoff/quantities-adapter";

export interface QuantityTableGroup {
  key: string;
  label: string;
  rows: QuantityTableRow[];
  totalsLabel: string;
  totals: {
    areaQuantityTotal: number | null;
    areaSecondaryTotal: number | null;
    areaSecondaryUnit: string | null;
    linearQuantityTotal: number | null;
    countQuantityTotal: number | null;
  };
}

function renderQuantityRow(row: QuantityTableRow) {
  const isArchived = row.status === "archived";
  const secondaryDisplayValue = row.secondaryQuantityDisplay.startsWith("Perimeter ")
    ? row.secondaryQuantityDisplay.replace(/^Perimeter\s+/, "")
    : row.secondaryQuantityDisplay;

  return (
    <tr
      key={row.id}
      className={`group border-b border-[#E2E8F1] last:border-0 transition-colors hover:bg-[#F8FBFB] ${
        isArchived ? "bg-[#FCFDFE]" : ""
      }`}
    >
      <td className="px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {row.colorHex ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.colorHex }}
                aria-hidden="true"
              />
            ) : null}
            <span className={`${ibmPlexSans.className} truncate text-[15px] font-semibold text-[#10283B]`}>
              {row.name}
            </span>
            {isArchived ? (
              <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[13px] font-semibold text-[#64748B]`}>
                Archived
              </span>
            ) : null}
          </div>
          {row.description ? (
            <p className={`${ibmPlexSans.className} mt-1 text-[13px] text-[#6A7A89]`}>{row.description}</p>
          ) : null}
        </div>
      </td>
      <td className="px-6 py-4">
        <p className={`${ibmPlexSans.className} text-right text-[15px] font-semibold tabular-nums text-[#10283B]`}>
          {row.quantityDisplay}
        </p>
      </td>
      <td className="px-6 py-4">
        <p
          className={`${ibmPlexSans.className} text-right tabular-nums ${
            secondaryDisplayValue === "—"
              ? "text-[13px] font-normal text-[#B0BEC8]"
              : "text-[15px] font-medium text-[#6A7A89]"
          }`}
        >
          {secondaryDisplayValue}
        </p>
      </td>
    </tr>
  );
}

export function TakeoffQuantitiesTable({
  rows,
  groups,
  emptyMessage = "No takeoff items saved yet.",
}: {
  rows: QuantityTableRow[];
  groups?: QuantityTableGroup[] | null;
  emptyMessage?: string;
}) {
  const shouldRenderGroups = Boolean(groups && groups.length > 0);

  return (
    <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-6 pb-6 pt-6">
            <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
              <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>{emptyMessage}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <colgroup>
                <col className="w-[48%]" />
                <col className="w-[26%]" />
                <col className="w-[26%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                  {["Description", "Quantity", "Secondary"].map((heading) => (
                    <th
                      key={heading}
                      className={`${ibmPlexSans.className} px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C] ${
                        heading === "Quantity" || heading === "Secondary" ? "text-right" : ""
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shouldRenderGroups
                  ? groups!.flatMap((group) => [
                      <tr key={`${group.key}-header`} className="border-b border-[#E2E8F1] bg-[#FCFDFE]">
                        <td colSpan={3} className="px-6 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>{group.label}</p>
                            {group.totalsLabel ? (
                              <p className={`${ibmPlexSans.className} text-[13px] text-[#6A7A89]`}>{group.totalsLabel}</p>
                            ) : null}
                          </div>
                        </td>
                      </tr>,
                      ...group.rows.map((row) => renderQuantityRow(row)),
                    ])
                  : rows.map((row) => renderQuantityRow(row))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
