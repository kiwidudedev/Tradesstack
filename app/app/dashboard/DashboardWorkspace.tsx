"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Pencil,
  ReceiptText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ibmPlexSans } from "@/lib/fonts";
import styles from "./dashboard.module.css";

type OverviewTone = "accent" | "ink" | "sage" | "gold";

type OverviewCardData = {
  label: string;
  value: string;
  meta: string;
  tone: OverviewTone;
};

type TodoItem = {
  title: string;
  count: number;
  detail: string;
};

type TodayItem = {
  title: string;
  eyebrow: string;
  detail: string;
  badge: string;
};

type LeadItem = {
  title: string;
  client: string;
  stage: string;
  dueLabel: string;
  value: string;
};

type SectionKey = "overview" | "todo" | "today" | "leads";

type DashboardWorkspaceProps = {
  dateLabel: string;
  initialTimeIso: string;
  greeting: string;
  firstName: string;
  overviewCards: OverviewCardData[];
  todoItems: TodoItem[];
  todaysTodo: TodayItem[];
  upcomingLeads: LeadItem[];
};

const overviewIcons = {
  accent: ClipboardList,
  ink: FileSearch,
  sage: BriefcaseBusiness,
  gold: ReceiptText,
} as const;

const initialSectionOrder: SectionKey[] = ["overview", "todo", "today", "leads"];

function formatAucklandTime(value: Date) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function moveItem(order: SectionKey[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= order.length) {
    return order;
  }

  const next = [...order];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function SectionControls({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={styles.editControls}>
      <button type="button" onClick={onMoveUp} disabled={!canMoveUp} className={styles.editControlButton}>
        <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
      </button>
      <button type="button" onClick={onMoveDown} disabled={!canMoveDown} className={styles.editControlButton}>
        <ArrowDown className="h-4 w-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(initialSectionOrder);
  const [currentTime, setCurrentTime] = useState(() => new Date(props.initialTimeIso));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const renderSection = (key: SectionKey, index: number) => {
    const controls = isEditing ? (
      <SectionControls
        canMoveUp={index > 0}
        canMoveDown={index < sectionOrder.length - 1}
        onMoveUp={() => setSectionOrder((current) => moveItem(current, index, -1))}
        onMoveDown={() => setSectionOrder((current) => moveItem(current, index, 1))}
      />
    ) : null;

    if (key === "overview") {
      return (
        <Card key={key} className={`${styles.overviewCard} ${isEditing ? styles.editingCard : ""}`}>
          <CardHeader className={styles.sectionHeader}>
            <div className={styles.sectionHeaderRow}>
              <CardTitle className={styles.sectionTitle}>Performance at a glance</CardTitle>
              {controls}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={styles.overviewGrid}>
              {props.overviewCards.map((item) => {
                const Icon = overviewIcons[item.tone];
                return (
                  <article key={item.label} className={styles.metricTile}>
                    <div className={styles.metricTop}>
                      <span className={styles[`iconBadge${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}>
                        <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                      </span>
                      <span className={`${ibmPlexSans.className} ${styles.metricLabel}`}>{item.label}</span>
                    </div>
                    <p className={styles.metricValue}>{item.value}</p>
                    <p className={`${ibmPlexSans.className} ${styles.metricMeta}`}>{item.meta}</p>
                  </article>
                );
              })}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (key === "todo") {
      return (
        <Card key={key} className={`${styles.todoCard} ${isEditing ? styles.editingCard : ""}`}>
          <CardHeader className={styles.sectionHeader}>
            <div className={styles.sectionHeaderRow}>
              <CardTitle className={styles.sectionTitle}>Priority actions</CardTitle>
              {controls}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={styles.todoList}>
              {props.todoItems.length > 0 ? (
                props.todoItems.map((item) => (
                  <article key={item.title} className={styles.todoRow}>
                    <span className={styles.todoCount}>{item.count}</span>
                    <div className={styles.todoText}>
                      <p className={styles.todoTitle}>{item.title}</p>
                      <p className={`${ibmPlexSans.className} ${styles.todoMeta}`}>{item.detail}</p>
                    </div>
                    <ArrowUpRight className={styles.todoArrow} strokeWidth={2.1} />
                  </article>
                ))
              ) : (
                <div className={styles.emptyState}>No urgent actions right now.</div>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (key === "today") {
      return (
        <Card key={key} className={`${styles.todayCard} ${isEditing ? styles.editingCard : ""}`}>
          <CardHeader className={styles.sectionHeader}>
            <div className={styles.sectionHeaderRow}>
              <CardTitle className={styles.sectionTitle}>Focus for the day</CardTitle>
              {controls}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={styles.todayList}>
              {props.todaysTodo.length > 0 ? (
                props.todaysTodo.map((item) => (
                  <article key={`${item.eyebrow}-${item.title}`} className={styles.todayRow}>
                    <span className={styles.todayCheck}>
                      <CheckCircle2 className="h-4 w-4" strokeWidth={2.3} />
                    </span>
                    <div className={styles.todayText}>
                      <p className={`${ibmPlexSans.className} ${styles.todayEyebrow}`}>{item.eyebrow}</p>
                      <p className={styles.todayTitle}>{item.title}</p>
                      <p className={`${ibmPlexSans.className} ${styles.todayMeta}`}>{item.detail}</p>
                    </div>
                    <span className={`${ibmPlexSans.className} ${styles.todayBadge}`}>{item.badge}</span>
                  </article>
                ))
              ) : (
                <div className={styles.emptyState}>Nothing scheduled for today yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={key} className={`${styles.leadsCard} ${isEditing ? styles.editingCard : ""}`}>
        <CardHeader className={styles.sectionHeader}>
          <div className={styles.sectionHeaderRow}>
            <CardTitle className={styles.sectionTitle}>What&apos;s coming up next</CardTitle>
            {controls}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className={styles.leadList}>
            {props.upcomingLeads.length > 0 ? (
              props.upcomingLeads.map((lead) => (
                <article key={`${lead.title}-${lead.dueLabel}`} className={styles.leadRow}>
                  <div className={styles.leadTop}>
                    <div>
                      <p className={styles.leadTitle}>{lead.title}</p>
                      <p className={`${ibmPlexSans.className} ${styles.leadMeta}`}>{lead.client}</p>
                    </div>
                    <span className={`${ibmPlexSans.className} ${styles.leadStage}`}>{lead.stage}</span>
                  </div>
                  <div className={styles.leadBottom}>
                    <span className={`${ibmPlexSans.className} ${styles.leadDue}`}>{lead.dueLabel}</span>
                    <span className={styles.leadValue}>{lead.value}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.emptyState}>No upcoming leads to show.</div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className={`${ibmPlexSans.className} ${styles.dashboardScope} space-y-6 pb-8`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroHeading}>
            {props.greeting}, {props.firstName}
          </h1>
          <p className={`${ibmPlexSans.className} ${styles.heroSummary}`}>
            See what needs attention, track your jobs, and keep everything moving in one place.
          </p>
        </div>
        <div className={styles.heroActions}>
          <p className={`${ibmPlexSans.className} ${styles.heroDate}`}>
            {props.dateLabel} {formatAucklandTime(currentTime)}
          </p>
          <button type="button" className={styles.heroBadgeButton} onClick={() => setIsEditing((current) => !current)}>
            <Pencil className="h-4 w-4" strokeWidth={2.3} />
            <span className={ibmPlexSans.className}>{isEditing ? "Done editing" : "Edit dashboard"}</span>
          </button>
        </div>
      </section>

      <section className={styles.dashboardGrid}>
        {sectionOrder.map((section, index) => renderSection(section, index))}
      </section>
    </main>
  );
}
