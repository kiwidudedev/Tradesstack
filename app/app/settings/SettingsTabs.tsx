"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Landmark, ShieldCheck, SlidersHorizontal, UsersRound, Workflow } from "lucide-react";
import { interMedium } from "@/lib/fonts";

const tabs = [
  { href: "/app/settings/organization", label: "Organization", icon: Building2 },
  { href: "/app/settings/users-permissions", label: "Users & Permissions", icon: UsersRound },
  { href: "/app/settings/financial-settings", label: "Financial Settings", icon: Landmark },
  { href: "/app/settings/integrations", label: "Integrations", icon: Workflow },
  { href: "/app/settings/compliance-contracts", label: "Compliance & Contracts", icon: ShieldCheck },
  { href: "/app/settings/platform-preferences", label: "Platform Preferences", icon: SlidersHorizontal },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <section className="overflow-x-auto">
      <div className="inline-flex min-w-max items-center gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${interMedium.className} inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${
                isActive
                  ? "border border-[#d1d9e6] bg-[#F8F9FC] font-medium text-[#1d2433] shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
                  : "border border-transparent font-medium text-[#4B5563] hover:border-[#d1d9e6] hover:bg-[#F8F9FC] hover:text-[#1d2433]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
