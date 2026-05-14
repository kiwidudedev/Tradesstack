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
import { OperationalBreadcrumbs } from "@/components/app/OperationalBreadcrumbs";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
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
      <OperationalBreadcrumbs
        items={[
          { label: "Clients", href: "/app/leads-clients/clients" },
          { label: displayName },
        ]}
      />

      <OperationalModuleHeader
        title={displayName}
        description={
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4" strokeWidth={2.1} />
              {client.email || "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-4 w-4" strokeWidth={2.1} />
              {client.phone || "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" strokeWidth={2.1} />
              Client since {formatDate(client.created_at)}
            </span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={isActive ? "approved" : "draft"}>
              {isActive ? "Active" : "Inactive"}
            </StatusBadge>
            <Button variant="secondary" asChild>
              <Link href="/app/leads-clients/clients">
                <ArrowLeft className="h-4 w-4" />
                Back to Clients
              </Link>
            </Button>
          </>
        }
      />

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
