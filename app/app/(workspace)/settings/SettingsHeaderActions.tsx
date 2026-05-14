"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

interface SettingsHeaderActionsProps {
  isSaving?: boolean;
}

export function SettingsHeaderActions(_props: SettingsHeaderActionsProps) {
  const pathname = usePathname();
  const showSaveButton = pathname === "/app/settings/organization";

  return (
    <div className="flex items-center gap-2">
      {showSaveButton ? (
        <Button type="submit" form="organization-settings-form" size="sm">
          Save organization
        </Button>
      ) : null}
      <Tooltip label="Close settings">
        <Link
          href="/app/dashboard"
          aria-label="Close settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2} />
        </Link>
      </Tooltip>
    </div>
  );
}
