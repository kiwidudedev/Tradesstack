"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";

const tabs = [
  { href: "/app/settings/organization", label: "Organization" },
  { href: "/app/settings/users-permissions", label: "Users & Permissions" },
  { href: "/app/settings/integrations", label: "Integrations" },
  { href: "/app/settings/compliance-contracts", label: "Compliance & Contracts" },
  { href: "/app/settings/platform-preferences", label: "Platform Preferences" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { session } = useAuth();
  const visibleTabs = tabs.filter((tab) => tab.href !== "/app/settings/users-permissions" || session?.role === "owner");

  return (
    <section className="w-full">
      <nav className="flex flex-col gap-1.5">
        {visibleTabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${interMedium.className} inline-flex min-h-[42px] items-center rounded-[14px] px-5 text-[15px] ${
                isActive
                  ? "bg-[var(--surface-muted)] font-semibold text-[var(--text-primary)]"
                  : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
