"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { OpportunityStage } from "@/lib/supabase/types";
import type { LiveOpportunityRow } from "@/lib/leads-clients-server";
import styles from "./opportunities.module.css";

type BoardColumnKey = "new" | "pricing" | "submitted" | "won" | "lost";

type BoardColumn = {
  key: BoardColumnKey;
  title: string;
  description: string;
  rows: LiveOpportunityRow[];
  toneClassName: string;
};

type OpportunityPriority = "High" | "Medium" | "Low";
type PriorityMap = Record<string, OpportunityPriority | undefined>;

function sortRowsByDue(left: LiveOpportunityRow, right: LiveOpportunityRow) {
  const leftDays = getDaysUntilIso(left.dueDateIso);
  const rightDays = getDaysUntilIso(right.dueDateIso);

  if (leftDays === null && rightDays === null) {
    return left.name.localeCompare(right.name);
  }
  if (leftDays === null) {
    return 1;
  }
  if (rightDays === null) {
    return -1;
  }
  if (leftDays !== rightDays) {
    return leftDays - rightDays;
  }

  return left.name.localeCompare(right.name);
}

function sortRowsByRecentActivity(left: LiveOpportunityRow, right: LiveOpportunityRow) {
  const leftTime = left.quotedDateIso
    ? new Date(left.quotedDateIso).getTime()
    : left.latestQuoteUpdatedIso
      ? new Date(left.latestQuoteUpdatedIso).getTime()
      : Number.NEGATIVE_INFINITY;
  const rightTime = right.quotedDateIso
    ? new Date(right.quotedDateIso).getTime()
    : right.latestQuoteUpdatedIso
      ? new Date(right.latestQuoteUpdatedIso).getTime()
      : Number.NEGATIVE_INFINITY;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.name.localeCompare(right.name);
}

function getDaysUntilIso(isoDate: string | null): number | null {
  if (!isoDate) {
    return null;
  }

  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrencyCompactNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDayMonth(value: string | null): string {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(date);
}

function getCardToneClassName(row: LiveOpportunityRow) {
  if (row.stage === "Won") {
    return styles.cardWon;
  }

  if (row.stage === "Lost") {
    return styles.cardLost;
  }

  const daysUntil = getDaysUntilIso(row.dueDateIso);
  if (daysUntil !== null && daysUntil < 0) {
    return styles.cardOverdue;
  }

  if (daysUntil !== null && daysUntil <= 2) {
    return styles.cardUrgent;
  }

  if (daysUntil !== null && daysUntil <= 7) {
    return styles.cardSoon;
  }

  return styles.cardDefault;
}

function getFooterDateText(row: LiveOpportunityRow) {
  if (row.stage === "Quoted" || row.stage === "Won" || row.stage === "Lost") {
    return formatDayMonth(row.quotedDateIso);
  }

  const daysUntil = getDaysUntilIso(row.dueDateIso);
  if (daysUntil === null) {
    return "No date";
  }

  if (daysUntil < 0) {
    return `${Math.abs(daysUntil)}d late`;
  }

  if (daysUntil === 0) {
    return "Today";
  }

  if (daysUntil === 1) {
    return "1d";
  }

  return `${daysUntil}d`;
}

function getFooterDateToneClassName(row: LiveOpportunityRow) {
  if (row.stage === "Quoted" || row.stage === "Won" || row.stage === "Lost") {
    return "";
  }

  const daysUntil = getDaysUntilIso(row.dueDateIso);
  if (daysUntil === null) {
    return "";
  }

  if (daysUntil < 0) {
    return styles.footerDateOverdue;
  }

  if (daysUntil <= 3) {
    return styles.footerDateSoon;
  }

  return "";
}

function getColumnSummary(rows: LiveOpportunityRow[]) {
  return {
    count: rows.length,
    totalValue: rows.reduce((sum, row) => sum + row.valueNZD, 0),
  };
}

function getColumnKeyFromStage(stage: OpportunityStage): BoardColumnKey {
  if (stage === "New") {
    return "new";
  }

  if (stage === "Reviewing" || stage === "Pricing") {
    return "pricing";
  }

  if (stage === "Quoted") {
    return "submitted";
  }

  if (stage === "Won") {
    return "won";
  }

  return "lost";
}

function getStageFromColumnKey(columnKey: BoardColumnKey): OpportunityStage {
  if (columnKey === "new") {
    return "New";
  }

  if (columnKey === "pricing") {
    return "Pricing";
  }

  if (columnKey === "submitted") {
    return "Quoted";
  }

  if (columnKey === "won") {
    return "Won";
  }

  return "Lost";
}

function buildColumns(rows: LiveOpportunityRow[]): BoardColumn[] {
  return [
    {
      key: "new",
      title: "New",
      description: "Fresh opportunities to triage",
      rows: rows.filter((row) => row.stage === "New").sort(sortRowsByDue),
      toneClassName: styles.columnNew,
    },
    {
      key: "pricing",
      title: "Pricing",
      description: "Reviewing and estimating",
      rows: rows.filter((row) => row.stage === "Reviewing" || row.stage === "Pricing").sort(sortRowsByDue),
      toneClassName: styles.columnPricing,
    },
    {
      key: "submitted",
      title: "Submitted",
      description: "Quotes already sent",
      rows: rows.filter((row) => row.stage === "Quoted").sort(sortRowsByRecentActivity),
      toneClassName: styles.columnSubmitted,
    },
    {
      key: "won",
      title: "Won",
      description: "Awarded opportunities",
      rows: rows.filter((row) => row.stage === "Won").sort(sortRowsByRecentActivity),
      toneClassName: styles.columnWon,
    },
    {
      key: "lost",
      title: "Lost",
      description: "Closed and not proceeding",
      rows: rows.filter((row) => row.stage === "Lost").sort(sortRowsByRecentActivity),
      toneClassName: styles.columnLost,
    },
  ];
}

export function OpportunitiesBoard({
  rows,
  organizationId,
}: {
  rows: LiveOpportunityRow[];
  organizationId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<BoardColumnKey | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [priorityById, setPriorityById] = useState<PriorityMap>({});
  const [priorityPickerId, setPriorityPickerId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const columns = useMemo(() => buildColumns(items), [items]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("tradesstack-opportunity-priorities");
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as PriorityMap;
      setPriorityById(parsed);
    } catch {
      setPriorityById({});
    }
  }, []);

  function updatePriority(opportunityId: string, priority?: OpportunityPriority) {
    setPriorityById((current) => {
      const next = { ...current };
      if (priority) {
        next[opportunityId] = priority;
      } else {
        delete next[opportunityId];
      }

      try {
        window.localStorage.setItem("tradesstack-opportunity-priorities", JSON.stringify(next));
      } catch {
        // Ignore storage write failures and keep the UI responsive.
      }

      return next;
    });
    setPriorityPickerId(null);
  }

  async function moveOpportunity(opportunityId: string, targetColumn: BoardColumnKey) {
    const current = items.find((item) => item.opportunityId === opportunityId);
    if (!current) {
      return;
    }

    const currentColumn = getColumnKeyFromStage(current.stage);
    if (currentColumn === targetColumn) {
      return;
    }

    const previousItems = items;
    const nextStage = getStageFromColumnKey(targetColumn);
    const optimisticItems = items.map((item) =>
      item.opportunityId === opportunityId
        ? {
            ...item,
            stage: nextStage,
            quotedDateIso:
              nextStage === "Quoted" && !item.quotedDateIso
                ? new Date().toISOString().slice(0, 10)
                : item.quotedDateIso,
            convertedProjectId: targetColumn !== "won" ? null : item.convertedProjectId,
          }
        : item
    );

    setBoardError(null);
    setItems(optimisticItems);

    try {
      if (targetColumn === "won") {
        const supabase = createBrowserSupabaseClient();
        const { data: acceptedQuote, error: acceptedQuoteError } = await supabase
          .from("project_quotes")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("originating_opportunity_id", current.opportunityId)
          .eq("status", "Accepted")
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (acceptedQuoteError) {
          throw new Error(acceptedQuoteError.message);
        }
        if (!acceptedQuote?.id) {
          throw new Error("Accept a quote before moving this opportunity to won.");
        }

        const response = await fetch(
          `/api/leads-clients/opportunities/${current.slug}/convert`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acceptedQuoteId: acceptedQuote.id }),
          },
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to move opportunity to won.");
        }
      } else {
        if (current.stage === "Won" || current.convertedProjectId) {
          throw new Error("Awarded opportunities cannot be moved out of Won through the board.");
        }
        const supabase = createBrowserSupabaseClient();
        const payload: {
          stage: OpportunityStage;
          quoted_at?: string;
        } = {
          stage: nextStage,
        };

        if (targetColumn === "submitted" && !current.quotedDateIso) {
          payload.quoted_at = new Date().toISOString().slice(0, 10);
        }

        const { error } = await supabase
          .from("organization_opportunities")
          .update(payload)
          .eq("organization_id", organizationId)
          .eq("id", current.opportunityId);

        if (error) {
          throw new Error(error.message);
        }
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setItems(previousItems);
      setBoardError(error instanceof Error ? error.message : "Unable to move opportunity right now.");
    }
  }

  return (
    <>
      {boardError ? (
        <p className={`${interMedium.className} ${styles.boardError}`}>
          {boardError}
        </p>
      ) : null}

      <div className={styles.boardScroller}>
        <div className={styles.boardGrid}>
          {columns.map((column) => {
            const summary = getColumnSummary(column.rows);
            const isDropTarget = dropColumn === column.key;

            return (
              <section
                key={column.key}
                className={`${styles.boardColumn} ${column.toneClassName} ${isDropTarget ? styles.boardColumnActiveDrop : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedId) {
                    setDropColumn(column.key);
                  }
                }}
                onDragLeave={() => {
                  if (dropColumn === column.key) {
                    setDropColumn(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedId = event.dataTransfer.getData("text/opportunity-id") || draggedId;
                  setDropColumn(null);
                  setDraggedId(null);
                  if (droppedId) {
                    void moveOpportunity(droppedId, column.key);
                  }
                }}
              >
                <div className={styles.columnHeader}>
                  <div>
                    <h3 className={styles.columnTitle}>{column.title}</h3>
                    <div className={styles.columnSummaryRow}>
                      <p className={`${interMedium.className} ${styles.columnValue}`}>
                        {summary.count > 0 ? formatCurrencyCompactNZD(summary.totalValue) : "No value"}
                      </p>
                      <p className={`${interMedium.className} ${styles.columnMeta}`}>
                        {summary.count} {summary.count === 1 ? "deal" : "deals"}
                      </p>
                    </div>
                  </div>
                  <div className={styles.columnActions}>
                    <Link
                      href="/app/leads-clients/opportunities/new"
                      className={styles.columnAdd}
                      aria-label={`Add opportunity from ${column.title} column`}
                    >
                      +
                    </Link>
                    <span className={styles.columnMore} aria-hidden="true">
                      ...
                    </span>
                  </div>
                </div>

                <div className={styles.columnBody}>
                  {column.rows.map((row) => (
                    <OpportunityCard
                      key={row.opportunityId}
                      row={row}
                      priority={priorityById[row.opportunityId]}
                      isPriorityPickerOpen={priorityPickerId === row.opportunityId}
                      isDragging={draggedId === row.opportunityId}
                      isPending={isPending}
                      onPriorityToggle={() => {
                        setPriorityPickerId((current) =>
                          current === row.opportunityId ? null : row.opportunityId
                        );
                      }}
                      onPriorityChange={(priority) => {
                        updatePriority(row.opportunityId, priority);
                      }}
                      onDragStart={() => {
                        setBoardError(null);
                        setPriorityPickerId(null);
                        setDraggedId(row.opportunityId);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropColumn(null);
                      }}
                    />
                  ))}

                  <Link
                    href="/app/leads-clients/opportunities/new"
                    className={styles.columnHoverAdd}
                    aria-label={`Add opportunity to ${column.title}`}
                  >
                    + Add Item
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function OpportunityCard({
  row,
  priority,
  isPriorityPickerOpen,
  isDragging,
  isPending,
  onPriorityToggle,
  onPriorityChange,
  onDragStart,
  onDragEnd,
}: {
  row: LiveOpportunityRow;
  priority?: OpportunityPriority;
  isPriorityPickerOpen: boolean;
  isDragging: boolean;
  isPending: boolean;
  onPriorityToggle: () => void;
  onPriorityChange: (priority?: OpportunityPriority) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      href={`/app/leads-clients/opportunities/${row.slug}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/opportunity-id", row.opportunityId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`${styles.opportunityCard} ${getCardToneClassName(row)} ${isDragging ? styles.opportunityCardDragging : ""} ${isPending ? styles.opportunityCardBusy : ""}`}
    >
      <div className={styles.cardMain}>
        <div className={styles.cardTextBlock}>
          <p className={`${interMedium.className} ${styles.cardTitle}`}>{row.name}</p>
          <p className={`${interMedium.className} ${styles.cardSubtitle}`}>{row.clientName}</p>
        </div>

        <div className={styles.cardInfoRow}>
          <span className={`${styles.footerDate} ${getFooterDateToneClassName(row)}`}>
            <Clock3 className={styles.footerIcon} aria-hidden="true" />
            <span className={`${interMedium.className} ${styles.footerDateText}`}>{getFooterDateText(row)}</span>
          </span>

          <span className={`${interMedium.className} ${styles.cardValueInline}`}>
            {row.valueNZD > 0 ? formatCurrencyCompactNZD(row.valueNZD) : "Value pending"}
          </span>

          <div className={styles.cardTagRow}>
            <button
              type="button"
              className={`${interMedium.className} ${styles.priorityTagButton} ${
                priority ? styles[`priorityTag${priority}`] : styles.priorityTagEmpty
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPriorityToggle();
              }}
            >
              <span className={styles.priorityTagAccent} aria-hidden="true" />
              <span>{priority ?? "Add tag"}</span>
            </button>

            {isPriorityPickerOpen ? (
              <div
                className={styles.priorityPicker}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {(["High", "Medium", "Low"] as OpportunityPriority[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${interMedium.className} ${styles.priorityOption} ${
                      styles[`priorityOption${option}`]
                    }`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onPriorityChange(option);
                    }}
                  >
                    {option}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${interMedium.className} ${styles.priorityClear}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPriorityChange(undefined);
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.cardFooter}>
        <OwnerCell owner={row.ownerName} compact avatarOnly />
      </div>
    </Link>
  );
}

function OwnerCell({
  owner,
  compact = false,
  avatarOnly = false,
}: {
  owner: string;
  compact?: boolean;
  avatarOnly?: boolean;
}) {
  const initial = owner.slice(0, 1).toUpperCase();

  return (
    <span className={`${styles.ownerCell} ${compact ? styles.ownerCellCompact : ""}`}>
      <span className={`${interMedium.className} ${styles.ownerBadge}`}>{initial}</span>
      {avatarOnly ? null : <span className={`${interMedium.className} ${styles.ownerName}`}>{owner}</span>}
    </span>
  );
}
