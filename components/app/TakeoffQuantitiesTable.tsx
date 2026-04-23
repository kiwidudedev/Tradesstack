import { ibmPlexSans, interMedium } from "@/lib/fonts";
import styles from "@/components/app/trade-pack-builder.module.css";
import type { QuantityRow } from "@/lib/takeoff/quantities-adapter";

const TABLE_GRID_TEMPLATE = "minmax(220px, 1.6fr) 180px";
const ROW_CELL_PADDING_CLASS = "px-2 py-1";
const DESCRIPTION_CELL_PADDING_CLASS = "px-3 py-1";
const ROW_DIVIDER_CLASS = "self-stretch border-l border-[#EEF2F7]";
const ROW_FIELD_SHELL_CLASS = "flex h-full w-full items-center";
const VALUE_CLASS = `${interMedium.className} flex h-[34px] w-full items-center px-1.5 text-[13px] leading-[1.1] text-[#1d2433]`;
const NUMERIC_VALUE_CLASS = `${VALUE_CLASS} justify-end text-right tabular-nums`;

export function TakeoffQuantitiesTable({
  rows,
  emptyMessage = "No takeoff items saved yet.",
}: {
  rows: QuantityRow[];
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE]">
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div
            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[#D7E1EC] bg-[#F3F4F6] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[#475569]`}
            style={{ gridTemplateColumns: TABLE_GRID_TEMPLATE }}
          >
            <span className="px-3 py-2.5 font-semibold">Description</span>
            <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Quantity</span>
          </div>
          <div className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
            {rows.map((row) => {
              const isArchived = row.status === "archived";

              return (
                <div
                  key={row.id}
                  className={`grid items-stretch gap-0 px-0 py-0 transition-colors hover:bg-slate-50/80 ${
                    isArchived ? "bg-[#FCFDFE] opacity-70" : ""
                  }`}
                  style={{ gridTemplateColumns: TABLE_GRID_TEMPLATE }}
                >
                  <div className={`${DESCRIPTION_CELL_PADDING_CLASS} flex h-full items-center`}>
                    <div className="flex min-h-[34px] w-full items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {row.colorHex ? (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: row.colorHex }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className={`${ibmPlexSans.className} truncate text-sm font-medium text-[#1d2433]`}>
                            {row.name}
                          </span>
                          {isArchived ? (
                            <span className={`${styles.quoteTabLabel} inline-flex items-center rounded-full border border-[#D7E1EC] bg-[#F8FAFC] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[#64748B]`}>
                              Archived
                            </span>
                          ) : null}
                        </div>
                        {row.description ? (
                          <p className={`${styles.quoteBodyLabel} mt-1 truncate pl-[10px] text-[13px] text-[#6B7280]`}>
                            {row.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                    <div className={`${ROW_FIELD_SHELL_CLASS} justify-end`}>
                      <div className="min-w-0">
                        <div className={`${NUMERIC_VALUE_CLASS} whitespace-nowrap`}>{row.totalDisplay}</div>
                        {row.secondaryDisplay ? (
                          <p className={`${styles.quoteBodyLabel} mt-1 px-1.5 text-right text-[11px] text-[#64748B]`}>
                            {row.secondaryDisplay}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 ? (
              <div className={`${interMedium.className} px-3 py-5 text-center text-sm text-[#73839a]`}>{emptyMessage}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
