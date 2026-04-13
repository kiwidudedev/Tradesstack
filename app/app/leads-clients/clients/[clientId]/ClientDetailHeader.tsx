import Link from "next/link";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Clock3,
  FileText,
  FolderOpen,
  LayoutGrid,
  Mail,
  NotebookText,
  Phone,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ibmPlexSans } from "@/lib/fonts";
import type { ClientRow } from "./client-detail-data";
import { formatDate } from "./client-detail-data";
import styles from "./client-detail.module.css";

type TabKey = "overview" | "jobs" | "quotes" | "invoices" | "files" | "notes" | "timeline";

export function ClientDetailHeader({
  client,
  clientId,
  activeTab,
  isActive,
}: {
  client: ClientRow;
  clientId: string;
  activeTab: TabKey;
  isActive: boolean;
}) {
  const displayName = client.company_name?.trim() || client.name;
  const clientInitials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  const navItems = [
    { key: "overview", label: "Overview", icon: LayoutGrid, href: `/app/leads-clients/clients/${clientId}` },
    { key: "jobs", label: "Jobs", icon: BriefcaseBusiness, href: `/app/leads-clients/clients/${clientId}/jobs` },
    { key: "quotes", label: "Quotes", icon: FileText, href: `/app/leads-clients/clients/${clientId}/quotes` },
    { key: "invoices", label: "Invoices", icon: Receipt, href: `/app/leads-clients/clients/${clientId}/invoices` },
    { key: "files", label: "Files", icon: FolderOpen, href: `/app/leads-clients/clients/${clientId}/files` },
    { key: "notes", label: "Notes", icon: NotebookText, href: `/app/leads-clients/clients/${clientId}/notes` },
    { key: "timeline", label: "Timeline", icon: Clock3, href: `/app/leads-clients/clients/${clientId}/timeline` },
  ] as const;

  return (
    <section className={styles.headerSection}>
      <div className={styles.backActionRow}>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className={`${ibmPlexSans.className} inline-flex items-center gap-[0.4rem] rounded-[0.576rem] border border-[#CBD5E1] bg-white px-4 py-2 text-[14px] font-medium text-[#475569] shadow-none transition hover:bg-[#F8FAFC] hover:text-[#475569]`}
        >
          <Link href="/app/leads-clients/clients">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Clients
          </Link>
        </Button>
      </div>

      <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.heroCard}`}>
        <div className={styles.heroCardBody}>
          <div className={styles.heroIdentityRow}>
            <span className={styles.heroAvatar}>{clientInitials || "CL"}</span>
            <div className={styles.heroIdentityText}>
              <div className={styles.heroTopline}>
                <h1 className={`${ibmPlexSans.className} truncate text-[1.7rem] font-bold leading-none tracking-[-0.03em] text-[#1d1d1d]`}>
                  {displayName}
                </h1>
                <span className={isActive ? styles.statusPillActive : styles.statusPillInactive}>{isActive ? "Active" : "Inactive"}</span>
              </div>
              <div className={styles.heroContactRow}>
                <span className={`${ibmPlexSans.className} ${styles.heroContactItem}`}>
                  <Mail className="h-4 w-4" strokeWidth={2.1} />
                  <span>{client.email || "-"}</span>
                </span>
                <span className={`${ibmPlexSans.className} ${styles.heroContactItem}`}>
                  <Phone className="h-4 w-4" strokeWidth={2.1} />
                  <span>{client.phone || "-"}</span>
                </span>
                <span className={`${ibmPlexSans.className} ${styles.heroContactItem}`}>
                  <Clock3 className="h-4 w-4" strokeWidth={2.1} />
                  <span>Client since {formatDate(client.created_at)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.topNavWrap}>
        <nav className={styles.topNav}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} href={item.href} className={`${ibmPlexSans.className} ${activeTab === item.key ? styles.topNavItemActive : styles.topNavItem}`}>
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                <span className="whitespace-nowrap text-[15px] leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
